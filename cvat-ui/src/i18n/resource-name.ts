// Copyright (C) CVAT Minus contributors
//
// SPDX-License-Identifier: MIT

import { t } from 'i18n';

const names: Record<string, string> = {
    task: t('task'),
    project: t('project'),
    job: t('job'),
    dataset: t('dataset'),
    Dataset: t('Dataset'),
    annotation: t('annotation'),
    Annotation: t('Annotation'),
    annotations: t('annotations'),
    Annotations: t('Annotations'),
};

export default function resourceName(resource: string): string {
    return names[resource] ?? resource;
}
