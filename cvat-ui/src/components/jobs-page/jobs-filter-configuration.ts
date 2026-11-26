// Copyright (C) 2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { t } from 'i18n';
import { Config } from '@react-awesome-query-builder/antd';
import asyncFetchUsers from 'components/resource-sorting-filtering/request-users';

export const config: Partial<Config> = {
    fields: {
        state: {
            label: t('State'),
            type: 'select',
            operators: ['select_any_in', 'select_equals'],
            valueSources: ['value'],
            fieldSettings: {
                listValues: [
                    { value: 'new', title: t('new') },
                    { value: 'in progress', title: t('in progress') },
                    { value: 'rejected', title: t('rejected') },
                    { value: 'completed', title: t('completed') },
                ],
            },
        },
        stage: {
            label: t('Stage'),
            type: 'select',
            operators: ['select_any_in', 'select_equals'],
            valueSources: ['value'],
            fieldSettings: {
                listValues: [
                    { value: 'annotation', title: t('annotation') },
                    { value: 'validation', title: t('validation') },
                    { value: 'acceptance', title: t('acceptance') },
                ],
            },
        },
        dimension: {
            label: t('Dimension'),
            type: 'select',
            operators: ['select_equals'],
            valueSources: ['value'],
            fieldSettings: {
                listValues: [
                    { value: '1d', title: '1D' },
                    { value: '2d', title: '2D' },
                    { value: '3d', title: '3D' },
                ],
            },
        },
        assignee: {
            label: t('Assignee'),
            type: 'select',
            valueSources: ['value'],
            operators: ['select_equals', 'is_empty', 'is_not_empty'],
            fieldSettings: {
                useAsyncSearch: true,
                forceAsyncSearch: true,
                asyncFetch: asyncFetchUsers,
            },
        },
        updated_date: {
            label: t('Last updated'),
            type: 'datetime',
            operators: ['between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
        },
        id: {
            label: 'ID',
            type: 'number',
            operators: ['equal', 'between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
            fieldSettings: { min: 0 },
            valueSources: ['value'],
        },
        task_id: {
            label: t('Task ID'),
            type: 'number',
            operators: ['equal', 'between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
            fieldSettings: { min: 0 },
            valueSources: ['value'],
        },
        project_id: {
            label: t('Project ID'),
            type: 'number',
            operators: ['equal', 'between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
            fieldSettings: { min: 0 },
            valueSources: ['value'],
        },
        task_name: {
            label: t('Task name'),
            type: 'text',
            valueSources: ['value'],
            operators: ['like'],
        },
        project_name: {
            label: t('Project name'),
            type: 'text',
            valueSources: ['value'],
            operators: ['like'],
        },
        type: {
            label: t('Job Type'),
            type: 'select',
            operators: ['select_equals'],
            valueSources: ['value'],
            fieldSettings: {
                listValues: [
                    { value: 'annotation', title: t('Annotation') },
                    { value: 'ground_truth', title: t('Ground truth') },
                    { value: 'replica', title: t('Replica') },
                ],
            },
        },
        parent_job_id: {
            label: t('Parent ID'),
            type: 'number',
            operators: ['is_empty', 'is_not_empty', 'equal', 'between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
            fieldSettings: { min: 0 },
            valueSources: ['value'],
        },
    },
};

export const localStorageRecentCapacity = 10;
export const localStorageRecentKeyword = 'recentlyAppliedJobsFilters';
export const predefinedFilterValues = {
    'Assigned to me': '{"and":[{"==":[{"var":"assignee"},"<username>"]}]}',
    'Not completed': '{"!":{"or":[{"==":[{"var":"state"},"completed"]},{"==":[{"var":"stage"},"acceptance"]}]}}',
};
