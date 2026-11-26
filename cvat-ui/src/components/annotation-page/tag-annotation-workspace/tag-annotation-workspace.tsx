// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { t } from 'i18n';
import './styles.scss';
import React, { useLayoutEffect, useRef, useState } from 'react';
import Layout from 'antd/lib/layout';
import { useSelector } from 'react-redux';
import { CombinedState } from 'reducers';

import CanvasLayout from 'components/annotation-page/canvas/grid-layout/canvas-layout';
import RemoveConfirmComponent from 'components/annotation-page/standard-workspace/remove-confirm';
import ActionPhases from './action-phases';
import TagAnnotationSidebar from './tag-annotation-sidebar/tag-annotation-sidebar';

const DEFAULT_TRACKS_HEIGHT = 240;
const MIN_TRACKS_HEIGHT = 120;
const MIN_PREVIEW_HEIGHT = 160;
const DIVIDER_HEIGHT = 12;
const HEIGHT_PREFERENCE = 'cvat-video-action-tracks-height';

export default function TagAnnotationWorkspace({ phases }: { phases?: boolean }): JSX.Element {
    const job = useSelector((state: CombinedState) => state.annotation.job.instance);
    const defaultTags = useSelector((state: CombinedState) => state.settings.workspace.showTagsOnFrame);
    const workspace = useRef<HTMLDivElement>(null);
    const drag = useRef<{ pointer: number; y: number; height: number } | null>(null);
    const [workspaceHeight, setWorkspaceHeight] = useState(window.innerHeight);
    const [preferredHeight, setPreferredHeight] = useState(() => (
        Number(localStorage.getItem(HEIGHT_PREFERENCE)) || DEFAULT_TRACKS_HEIGHT
    ));
    const maxHeight = Math.max(0, workspaceHeight - DIVIDER_HEIGHT -
        Math.min(MIN_PREVIEW_HEIGHT, Math.floor(workspaceHeight / 2)));
    const minHeight = Math.min(MIN_TRACKS_HEIGHT, maxHeight);
    const clampHeight = (height: number): number => Math.min(maxHeight, Math.max(minHeight, height));
    const tracksHeight = clampHeight(preferredHeight);
    const [showObjects, setShowObjects] = useState(() => localStorage.getItem('cvat-video-objects') !== 'off');
    const [showTags, setShowTags] = useState(() => {
        const preference = localStorage.getItem('cvat-video-frame-tags');
        return preference === null ? defaultTags : preference === 'on';
    });

    useLayoutEffect(() => {
        const element = workspace.current;
        if (!phases || !element) return undefined;
        const measure = (): void => setWorkspaceHeight(element.clientHeight);
        const observer = new ResizeObserver(measure);
        measure();
        observer.observe(element);
        return () => observer.disconnect();
    }, [phases]);

    function saveHeight(height: number): void {
        setPreferredHeight(height);
        localStorage.setItem(HEIGHT_PREFERENCE, String(height));
    }

    return (
        <Layout hasSider className='cvat-tag-annotation-workspace'>
            <div
                ref={workspace}
                className={phases ? 'cvat-tag-video-content cvat-video-understanding-content' : 'cvat-tag-video-content'}
            >
                <CanvasLayout
                    fitContainer={phases}
                    showObjectOverlays={phases ? showObjects : undefined}
                    showFrameTagOverlays={phases ? showTags : undefined}
                />
                {phases && (
                    <>
                        {/* A focusable separator is an interactive ARIA window splitter. */}
                        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
                        <div
                            className='cvat-action-phase-divider'
                            role='separator'
                            aria-label={t('Resize action tracks')}
                            aria-orientation='horizontal'
                            aria-controls='cvat-action-phase-pane'
                            aria-valuemin={minHeight}
                            aria-valuemax={maxHeight}
                            aria-valuenow={tracksHeight}
                            aria-valuetext={`${tracksHeight} pixels`}
                            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                            tabIndex={0}
                            title={t('Drag to resize action tracks')}
                            onPointerDown={(event) => {
                                if (!event.isPrimary || event.button !== 0) return;
                                event.preventDefault();
                                event.currentTarget.setPointerCapture(event.pointerId);
                                drag.current = { pointer: event.pointerId, y: event.clientY, height: tracksHeight };
                            }}
                            onPointerMove={(event) => {
                                if (drag.current?.pointer !== event.pointerId) return;
                                const height = clampHeight(drag.current.height + drag.current.y - event.clientY);
                                setPreferredHeight(Math.round(height));
                            }}
                            onLostPointerCapture={(event) => {
                                if (drag.current?.pointer !== event.pointerId) return;
                                drag.current = null;
                                saveHeight(tracksHeight);
                            }}
                            onKeyDown={(event) => {
                                const { key } = event;
                                if (key !== 'ArrowUp' && key !== 'ArrowDown') return;
                                event.preventDefault();
                                const step = key === 'ArrowUp' ? 16 : -16;
                                saveHeight(clampHeight(tracksHeight + step));
                            }}
                        />
                        <div id='cvat-action-phase-pane' className='cvat-action-phase-pane' style={{ height: tracksHeight }}>
                            <ActionPhases
                                key={job.id}
                                job={job}
                                showObjects={showObjects}
                                showTags={showTags}
                                onShowObjects={(enabled) => {
                                    setShowObjects(enabled);
                                    localStorage.setItem('cvat-video-objects', enabled ? 'on' : 'off');
                                }}
                                onShowTags={(enabled) => {
                                    setShowTags(enabled);
                                    localStorage.setItem('cvat-video-frame-tags', enabled ? 'on' : 'off');
                                }}
                            />
                        </div>
                    </>
                )}
            </div>
            {!phases && <TagAnnotationSidebar />}
            <RemoveConfirmComponent />
        </Layout>
    );
}
