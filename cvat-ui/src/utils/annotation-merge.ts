// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { isEqual, omit } from 'lodash';
import type { SerializedCollection, SerializedTrack } from 'cvat-core/src/server-response-types';

export const annotationKinds = ['tags', 'shapes', 'tracks', 'intervals'] as const;
type Kind = typeof annotationKinds[number];
type Annotation = SerializedCollection[Kind][number];
type Keyframe = SerializedTrack['shapes'][number];

export interface AnnotationConflict {
    key: string;
    kind: Kind;
    id: number;
    label: number;
    frames: number[];
    local: Annotation | Keyframe | undefined;
    remote: Annotation | Keyframe | undefined;
    nearby: { frame: number; shape?: Keyframe }[];
}

type Changes = Partial<SerializedCollection>;
export interface AnnotationMerge {
    create: Changes;
    update: Changes;
    delete: Changes;
    conflicts: AnnotationConflict[];
}

export function comparableAnnotations(annotations: SerializedCollection): SerializedCollection {
    const result: SerializedCollection = JSON.parse(JSON.stringify(annotations, (key, value) => (
        key === 'clientID' ? undefined : value
    )));
    for (const kind of annotationKinds) {
        result[kind] = result[kind].map((item) => {
            const payload = JSON.parse(JSON.stringify(item, (key, value) => (key === 'id' ? undefined : value)));
            return { ...payload, id: item.id };
        });
        result[kind].sort((a, b) => (a.id ?? Infinity) - (b.id ?? Infinity));
    }
    return result;
}

function framesFor(item: Annotation): number[] {
    if ('start' in item) return item.stop === null ? [item.start] : [item.start, item.stop - 1];
    if ('shapes' in item && item.shapes.length > 1) return [item.frame, item.shapes.at(-1).frame];
    return [item.frame];
}

function keyframeEdits(base: Map<number, Keyframe>, updated: Map<number, Keyframe>): number[] {
    return [...new Set([...base.keys(), ...updated.keys()])]
        .filter((frame) => !isEqual(base.get(frame), updated.get(frame)));
}

function interpolationSpan(frames: number[], frame: number, stopFrame: number): [number, number] {
    let start = frame;
    for (const candidate of frames) {
        if (candidate > frame) return [start, candidate];
        if (candidate < frame) start = candidate;
    }
    return [start, stopFrame];
}

function mergeTrack(
    base: SerializedTrack,
    local: SerializedTrack,
    remote: SerializedTrack,
    stopFrame: number,
    conflicts: AnnotationConflict[],
    useLocal: Set<string>,
): SerializedTrack | null {
    if ([base, local, remote].some((track) => track.elements.length)) return null;
    const metadata = (track: SerializedTrack): object => omit(track, ['shapes', 'frame', 'source']);
    const localMetadata = !isEqual(metadata(base), metadata(local));
    const remoteMetadata = !isEqual(metadata(base), metadata(remote));
    if ((localMetadata || remoteMetadata) && !isEqual(metadata(local), metadata(remote))) return null;

    const asMap = (track: SerializedTrack): Map<number, Keyframe> => (
        new Map(track.shapes.map((shape) => [shape.frame, shape]))
    );
    const before = asMap(base);
    const yours = asMap(local);
    const theirs = asMap(remote);
    const output = new Map(theirs);
    const frames = [...before.keys()].sort((a, b) => a - b);
    const remoteEdits = keyframeEdits(before, theirs);
    const remoteSpans = new Map(remoteEdits.map((frame) => [frame, interpolationSpan(frames, frame, stopFrame)]));

    for (const frame of keyframeEdits(before, yours)) {
        const localShape = yours.get(frame);
        if (isEqual(localShape, theirs.get(frame))) continue;
        const [left, right] = interpolationSpan(frames, frame, stopFrame);
        const overlap = remoteEdits.filter((other) => {
            const [start, stop] = remoteSpans.get(other);
            return other === frame || (left < stop && start < right);
        });
        if (overlap.length) {
            const key = `tracks:${base.id}:${frame}`;
            conflicts.push({
                key,
                kind: 'tracks',
                id: base.id,
                label: local.label_id,
                frames: [frame],
                local: localShape,
                remote: theirs.get(frame),
                nearby: overlap.filter((other) => other !== frame)
                    .map((other) => ({ frame: other, shape: theirs.get(other) })),
            });
            if (!useLocal.has(key)) continue;
        }
        if (localShape) output.set(frame, localShape);
        else output.delete(frame);
    }

    const shapes = [...output.values()].sort((a, b) => a.frame - b.frame);
    if (!shapes.length) return null;
    return {
        ...remote, source: local.source !== base.source ? local.source : remote.source, frame: shapes[0].frame, shapes,
    };
}

export function changedTrackKeyframes(base: SerializedCollection, draft: SerializedCollection): {
    track: number | null; label: number; frame: number; before?: Keyframe; after?: Keyframe;
}[] {
    const previous = new Map(base.tracks.map((track) => [track.id, track] as const));
    const current = new Map(draft.tracks
        .filter((track) => track.id !== undefined).map((track) => [track.id, track] as const));
    const edits = [];
    for (const track of [...base.tracks, ...draft.tracks.filter((item) => item.id === undefined)]) {
        const before = new Map((previous.get(track.id)?.shapes ?? []).map((shape) => [shape.frame, shape] as const));
        const after = new Map((track.id === undefined ? track.shapes : current.get(track.id)?.shapes ?? [])
            .map((shape) => [shape.frame, shape] as const));
        for (const frame of keyframeEdits(before, after)) {
            edits.push({
                track: track.id ?? null,
                label: track.label_id,
                frame,
                before: before.get(frame),
                after: after.get(frame),
            });
        }
    }
    return edits;
}

export function mergeAnnotations(
    base: SerializedCollection,
    local: SerializedCollection,
    snapshot: SerializedCollection,
    stopFrame: number,
    useLocal: Set<string> = new Set(),
): AnnotationMerge {
    const remote = comparableAnnotations(snapshot);
    const result: AnnotationMerge = {
        create: {}, update: {}, delete: {}, conflicts: [],
    };
    for (const kind of annotationKinds) {
        const before = new Map<number, Annotation>(base[kind].map((item) => [item.id, item] as const));
        const yours = new Map<number, Annotation>(local[kind].filter((item) => item.id !== undefined)
            .map((item) => [item.id, item] as const));
        const theirs = new Map<number, Annotation>(remote[kind].map((item) => [item.id, item] as const));
        const created: Annotation[] = local[kind].filter((item) => item.id === undefined);
        const updated: Annotation[] = [];
        const deletedIDs = new Set<number>();

        for (const [id, initial] of before) {
            const mine = yours.get(id);
            const current = theirs.get(id);
            if (isEqual(initial, mine) || isEqual(current, mine)) continue;
            let merged = mine;
            if (!isEqual(initial, current)) {
                const conflictCount = result.conflicts.length;
                const track = kind === 'tracks' && mine && current ? mergeTrack(
                    initial as SerializedTrack,
                    mine as SerializedTrack,
                    current as SerializedTrack,
                    stopFrame,
                    result.conflicts,
                    useLocal,
                ) : null;
                if (track) {
                    merged = track;
                } else {
                    result.conflicts.length = conflictCount;
                    const key = `${kind}:${id}`;
                    result.conflicts.push({
                        key,
                        kind,
                        id,
                        label: (mine ?? current ?? initial).label_id,
                        frames: framesFor(mine ?? current ?? initial),
                        local: mine,
                        remote: current,
                        nearby: [],
                    });
                    if (!useLocal.has(key)) continue;
                }
            }
            if (isEqual(merged, current)) continue;
            if (merged && current) updated.push(merged);
            else if (current) deletedIDs.add(current.id);
            else if (merged) created.push({ ...merged, id: undefined });
        }

        Object.assign(result.create, { [kind]: created });
        Object.assign(result.update, { [kind]: updated });
        // The delete API requires server IDs on skeleton elements as well as their parents.
        Object.assign(result.delete, { [kind]: snapshot[kind].filter((item) => deletedIDs.has(item.id)) });
    }
    return result;
}
