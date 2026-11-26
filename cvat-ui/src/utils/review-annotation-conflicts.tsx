// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { t } from 'i18n';
import React from 'react';
import Button from 'antd/lib/button';
import Modal from 'antd/lib/modal';
import Radio from 'antd/lib/radio';
import type { Job } from 'cvat-core-wrapper';
import type { AnnotationConflict } from './annotation-merge';

const kinds = {
    tracks: 'Track',
    shapes: 'Shape',
    tags: 'Tag',
    intervals: 'Interval',
};

function describe(object: AnnotationConflict['local']): string {
    if (!object) return 'No keyframe or annotation at this position';
    if ('points' in object && object.points) {
        const coordinates = object.points.map((point) => Math.round(point * 10) / 10).join(', ');
        const visibility = [object.outside && 'Outside', object.occluded && 'Occluded'].filter(Boolean).join(' · ');
        return [visibility, coordinates].filter(Boolean).join(' · ');
    }
    if ('shapes' in object) return `${object.shapes.length} keyframes · label ${object.label_id}`;
    return JSON.stringify(object);
}

export default function reviewAnnotationConflicts(
    job: Job, conflicts: AnnotationConflict[], download: () => void,
): Promise<Set<string> | null> {
    return new Promise((resolve) => {
        const choices = new Set<string>();
        Modal.confirm({
            title: t('Review annotation conflicts'),
            width: 720,
            closable: true,
            icon: null,
            okText: t('Save selected changes'),
            cancelText: t('Keep editing'),
            content: (
                <>
                    <p>
                        {t('Both versions are kept locally. Choose which version to save for each conflict.')}
                    </p>
                    <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                        {conflicts.map((item) => {
                            const label = job.labels.find(
                                (candidate) => candidate.id === item.label,
                            )?.name ?? item.label;
                            const nearby = item.nearby.map(({ frame }) => frame).join(', ');
                            const frameRange = item.frames.join('–');
                            return (
                                <div key={item.key} style={{ paddingBlock: 10 }}>
                                    <strong>
                                        {t('{{value1}} #{{id}} · {{label}} · Frame {{frameRange}}', {
                                            value1: kinds[item.kind], id: item.id, label, frameRange,
                                        })}
                                    </strong>
                                    {nearby && (
                                        <div>{t('Server also edited nearby keyframes {{nearby}}', { nearby })}</div>
                                    )}
                                    <Radio.Group defaultValue='server' onChange={({ target }) => {
                                        if (target.value === 'local') choices.add(item.key);
                                        else choices.delete(item.key);
                                    }}
                                    >
                                        <Radio value='server'>
                                            {t('Keep server · {{value1}}', { value1: describe(item.remote) })}
                                        </Radio>
                                        <Radio value='local'>
                                            {t('Apply mine · {{value1}}', { value1: describe(item.local) })}
                                        </Radio>
                                    </Radio.Group>
                                </div>
                            );
                        })}
                    </div>
                    <Button type='link' onClick={download}>{t('Download both versions')}</Button>
                </>
            ),
            onOk: () => { resolve(choices); },
            onCancel: () => { resolve(null); },
        });
    });
}
