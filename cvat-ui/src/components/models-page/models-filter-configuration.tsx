// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { t } from 'i18n';
import { Config } from '@react-awesome-query-builder/antd';

export const config: Partial<Config> = {
    fields: {
        name: {
            label: t('Name'),
            type: 'text',
            valueSources: ['value'],
            operators: ['like'],
        },
        description: {
            label: t('Description'),
            type: 'text',
            valueSources: ['value'],
            operators: ['like'],
        },
        provider: {
            label: t('Provider'),
            type: 'select',
            valueSources: ['value'],
            operators: ['select_equals'],
            fieldSettings: {
                listValues: [
                    { value: 'cvat', title: 'CVAT' },
                    { value: 'huggingface', title: 'Hugging Face' },
                    { value: 'native', title: t('Native') },
                    { value: 'roboflow', title: 'Roboflow' },
                ],
            },
        },
        owner: {
            label: t('Owner'),
            type: 'text',
            valueSources: ['value'],
            operators: ['like'],
        },
        created_date: {
            label: t('Created date'),
            type: 'datetime',
            operators: ['between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
        },
        kind: {
            label: t('Kind'),
            type: 'select',
            valueSources: ['value'],
            fieldSettings: {
                listValues: [
                    { value: 'classifier', title: t('Classifier') },
                    { value: 'detector', title: t('Detector') },
                    { value: 'segmenter', title: t('Segmenter') },
                    { value: 'interactor', title: t('Interactor') },
                    { value: 'tracker', title: t('Tracker') },
                    { value: 'reid', title: t('ReID') },
                ],
            },
        },
    },
};

export const localStorageRecentCapacity = 10;
export const localStorageRecentKeyword = 'recentlyAppliedModelsFilters';
export const predefinedFilterValues = {};
