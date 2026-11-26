// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { t } from 'i18n';
import Modal from 'antd/lib/modal';
import notification from 'antd/lib/notification';
import { isEqual } from 'lodash';
import { normalizeJobAnnotationRevision, installJobAnnotationRevision } from 'cvat-core/src/annotations';
import {
    JobAnnotationRevision, JobAnnotationSubmission, readJobAnnotationRevision, submitJobAnnotationRevision,
} from 'cvat-core/src/server-proxy';
import type { Job } from 'cvat-core-wrapper';

import { changedTrackKeyframes, comparableAnnotations, mergeAnnotations } from './annotation-merge';
import reviewAnnotationConflicts from './review-annotation-conflicts';

type Annotations = Awaited<ReturnType<Job['annotations']['export']>>;
const kinds = ['tags', 'shapes', 'tracks', 'intervals'] as const;
const storeName = 'drafts';

interface Draft {
    id: string;
    scope: string;
    base: Annotations;
    labels: ReturnType<Job['labels'][number]['toJSON']>[];
    annotations: Annotations;
    savedAt: number;
    explicitSave?: boolean;
    keyframes?: ReturnType<typeof changedTrackKeyframes>;
    pendingSubmission?: { request: JobAnnotationSubmission; local: Annotations };
}

interface DraftSession {
    draft: Draft;
    recovered: string[];
}

const sessions = new WeakMap<Job, DraftSession>();
let opening: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
    if (!opening) {
        opening = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('cvat-annotation-drafts', 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore(storeName, { keyPath: 'id' }).createIndex('scope', 'scope');
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        }).catch((error) => {
            opening = undefined;
            throw error;
        });
    }
    return opening;
}

async function readDrafts(scope: string): Promise<Draft[]> {
    const db = await database();
    return new Promise((resolve, reject) => {
        const request = db.transaction(storeName).objectStore(storeName).index('scope').getAll(scope);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function writeDraft(draft: Draft, remove: string[] = []): Promise<void> {
    const db = await database();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        for (const id of remove) store.delete(id);
        if (!draft.pendingSubmission && isEqual(draft.base, draft.annotations)) store.delete(draft.id);
        else store.put(draft);
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
    });
}

function clean(annotations: Annotations): Annotations {
    const copy: Annotations = JSON.parse(JSON.stringify(annotations, (key, value) => (
        key === 'clientID' ? undefined : value
    )));
    for (const kind of kinds) {
        copy[kind].sort((a, b) => (a.id ?? Infinity) - (b.id ?? Infinity));
    }
    return copy;
}

async function restore(job: Job, current: Annotations, draft: Draft): Promise<void> {
    const added: Partial<Annotations> = {};
    const removed: Partial<Annotations> = {};
    const base = clean(current);
    for (const kind of kinds) {
        // IDs match objects loaded from the server. New local objects have no server ID.
        const old = new Map<number, unknown>(base[kind].map((annotation) => [annotation.id, annotation] as const));
        const next = new Map<number, unknown>(draft.annotations[kind]
            .map((annotation) => [annotation.id, annotation] as const));
        Object.assign(added, {
            [kind]: draft.annotations[kind].filter((annotation) => (
                annotation.id === undefined || !isEqual(annotation, old.get(annotation.id))
            )),
        });
        Object.assign(removed, {
            [kind]: current[kind].filter((annotation) => !isEqual(old.get(annotation.id), next.get(annotation.id))),
        });
    }
    await job.annotations.commit(added, removed, null);
}

function downloadDrafts(job: Job, data: unknown): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `cvat-job-${job.id}-drafts.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function offerDraft(job: Job, drafts: Draft[], canRestore: boolean): Promise<boolean> {
    return new Promise((resolve) => {
        Modal.confirm({
            title: t('Local annotation drafts are available'),
            content: canRestore ?
                t('Open a previously stored draft and use Save to review changes before merging.') :
                t('The labels or local drafts differ. Download the drafts to compare the saved versions.'),
            okText: canRestore ? t('Open local draft') : t('Download drafts'),
            cancelText: t('Keep server view'),
            closable: true,
            onOk: () => {
                if (!canRestore) downloadDrafts(job, drafts);
                resolve(canRestore);
            },
            onCancel: () => { resolve(false); },
        });
    });
}

function createSubmissionId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] % 16) + 64;
    bytes[8] = (bytes[8] % 64) + 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function persistDraft(session: DraftSession): Promise<void> {
    try {
        await writeDraft(session.draft, session.recovered);
    } catch {
        throw new Error('Could not save the local draft. Your edits are still open in this tab.');
    }
    session.recovered.splice(0);
}

export async function resetDraftAfterImport(job: Job): Promise<void> {
    const previous = sessions.get(job);
    if (!previous) return;
    const base = clean(await job.annotations.export());
    sessions.set(job, {
        draft: {
            id: createSubmissionId(),
            scope: previous.draft.scope,
            base,
            annotations: base,
            labels: job.labels.map((label) => label.toJSON()),
            savedAt: Date.now(),
        },
        recovered: [],
    });
}

export async function startAnnotationDraft(job: Job, user: { id: number; username: string }): Promise<void> {
    try {
        const scope = JSON.stringify([user.id, user.username, job.taskId, job.id]);
        const current = await job.annotations.export();
        const base = clean(current);
        const labels = job.labels.map((label) => label.toJSON());
        const candidates = (await readDrafts(scope).catch(() => null))?.filter((item) => (
            item.pendingSubmission || !isEqual(item.annotations, base)
        ));
        if (!candidates) notification.warning({ message: t('Local annotation backup is unavailable') });
        const matching = candidates?.length > 0 && candidates.every((item) => (
            isEqual(item.labels, labels) && isEqual(item.base, candidates[0].base) &&
            isEqual(item.annotations, candidates[0].annotations)
        ));
        const recoverable = candidates?.length > 0 && (
            (matching && candidates[0].explicitSave && isEqual(candidates[0].base, base)) ||
            await offerDraft(job, candidates, matching)
        );
        const prior = recoverable ? candidates[0] : null;
        if (prior) {
            await restore(job, current, prior);
            notification.info({
                message: t('Local annotation draft restored'),
                description: t('Use Save to sync it to CVAT.'),
            });
        }

        const id = createSubmissionId();
        const session: DraftSession = {
            draft: {
                id,
                scope,
                base: prior?.base ?? base,
                labels,
                annotations: prior?.annotations ?? base,
                pendingSubmission: prior?.pendingSubmission,
                explicitSave: prior?.explicitSave,
                savedAt: Date.now(),
            },
            recovered: recoverable ? candidates.map((item) => item.id) : [],
        };
        sessions.set(job, session);
    } catch {
        notification.warning({ message: t('Local annotation backup is unavailable') });
    }
}

function responseCode(error: unknown): number {
    return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number' ?
        error.code : 0;
}

function rejectedSubmission(error: unknown): boolean {
    const code = responseCode(error);
    return code >= 400 && code < 500 && code !== 408;
}

async function installSavedAnnotations(
    job: Job, expectedSession: DraftSession, local: Annotations, saved: JobAnnotationRevision,
): Promise<void> {
    const session = sessions.get(job);
    if (session !== expectedSession) return;
    const current = clean(await job.annotations.export());
    const changedSinceSave = !isEqual(current, local);
    let { base } = session.draft;
    if (changedSinceSave) {
        notification.info({ message: t('Newer edits are still open. Use Save to submit them.') });
    } else {
        await installJobAnnotationRevision(job, saved.annotations);
        base = clean(await job.annotations.export());
    }
    session.draft = {
        ...session.draft, base, annotations: base, pendingSubmission: undefined, keyframes: [],
    };
    try {
        await persistDraft(session);
    } catch {
        notification.warning({ message: t('Saved to CVAT, but could not clear the local draft') });
    }
}

export async function saveAnnotationDraft(
    job: Job, setReviewing: (reviewing: boolean) => void,
): Promise<boolean> {
    const session = sessions.get(job);
    if (!session) throw new Error('Reload the job to initialize versioned annotation saves.');
    const local = clean(await job.annotations.export());
    const base = comparableAnnotations(session.draft.base);
    const yours = comparableAnnotations(local);
    session.draft = {
        ...session.draft,
        annotations: local,
        labels: job.labels.map((label) => label.toJSON()),
        explicitSave: true,
        keyframes: changedTrackKeyframes(base, yours),
        savedAt: Date.now(),
    };
    await persistDraft(session);

    const existing = session.draft.pendingSubmission;
    if (existing) {
        try {
            const saved = await submitJobAnnotationRevision(job.id, existing.request);
            if (isEqual(existing.local, local)) {
                await installSavedAnnotations(job, session, local, saved);
                return true;
            }
            session.draft.pendingSubmission = undefined;
        } catch (error) {
            if (rejectedSubmission(error)) session.draft.pendingSubmission = undefined;
            if (responseCode(error) !== 409) throw error;
        }
    }

    if (isEqual(base, yours) && !existing) return true;

    for (let attempt = 0; attempt < 3; attempt++) {
        const version = await readJobAnnotationRevision(job.id);
        const remote = clean(await normalizeJobAnnotationRevision(job, version.annotations));
        if (kinds.some((kind) => remote[kind].length !== version.annotations[kind].length)) {
            throw new Error('Some server annotations could not be loaded. Reload the job before saving your draft.');
        }
        let plan = mergeAnnotations(base, yours, remote, job.stopFrame);
        if (plan.conflicts.length) {
            const archive = {
                ...session.draft,
                id: createSubmissionId(),
                scope: `conflicts:${session.draft.scope}`,
                annotations: local,
                remote: version.annotations,
                conflicts: plan.conflicts,
                savedAt: Date.now(),
            };
            await writeDraft(archive);
            setReviewing(true);
            try {
                const choices = await reviewAnnotationConflicts(
                    job, plan.conflicts, () => downloadDrafts(job, [archive]),
                );
                if (!choices) return false;
                plan = mergeAnnotations(base, yours, remote, job.stopFrame, choices);
            } finally {
                setReviewing(false);
            }
        }

        const request: JobAnnotationSubmission = {
            revision: version.revision,
            submission: createSubmissionId(),
            create: plan.create,
            update: plan.update,
            delete: plan.delete,
        };
        if (!isEqual(clean(await job.annotations.export()), local)) {
            notification.warning({
                message: t('The local draft changed during review. Save again to include the latest edits.'),
            });
            return false;
        }
        session.draft.pendingSubmission = { request, local };
        await persistDraft(session);
        try {
            const saved = await submitJobAnnotationRevision(job.id, request);
            await installSavedAnnotations(job, session, local, saved);
            return true;
        } catch (error) {
            if (rejectedSubmission(error)) session.draft.pendingSubmission = undefined;
            if (responseCode(error) !== 409) throw error;
        }
    }
    throw new Error('The server annotations kept changing. Your draft is still available.');
}
