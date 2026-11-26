// Copyright (C) CVAT Minus contributors
//
// SPDX-License-Identifier: MIT

import { AntdConfig, Config } from '@react-awesome-query-builder/antd';
import { language, languages, t } from 'i18n';

const queryBuilderConfig: Config = {
    ...AntdConfig,
    conjunctions: {
        ...AntdConfig.conjunctions,
        AND: { ...AntdConfig.conjunctions.AND, label: t('And') },
        OR: { ...AntdConfig.conjunctions.OR, label: t('Or') },
    },
    operators: {
        ...AntdConfig.operators,
        like: { ...AntdConfig.operators.like, label: t('Contains') },
        not_like: { ...AntdConfig.operators.not_like, label: t('Not contains') },
        between: { ...AntdConfig.operators.between, label: t('Between') },
        is_empty: { ...AntdConfig.operators.is_empty, label: t('Is empty') },
        is_not_empty: { ...AntdConfig.operators.is_not_empty, label: t('Is not empty') },
        select_any_in: { ...AntdConfig.operators.select_any_in, label: t('Any in') },
        select_not_any_in: { ...AntdConfig.operators.select_not_any_in, label: t('Not in') },
    },
    settings: {
        ...AntdConfig.settings,
        locale: {
            ...AntdConfig.settings.locale,
            moment: languages[language].dates,
            antd: languages[language].components,
        },
        fieldPlaceholder: t('Select field'),
        operatorPlaceholder: t('Select operator'),
        addRuleLabel: t('Add rule'),
        addGroupLabel: t('Add group'),
        delGroupLabel: t('Delete'),
        deleteLabel: t('Delete'),
        valueLabel: t('Value'),
        valuePlaceholder: t('Value'),
        fieldLabel: t('Field'),
        operatorLabel: t('Operator'),
        notLabel: t('Not'),
        lockLabel: t('Lock'),
        lockedLabel: t('Locked'),
    },
};

export default queryBuilderConfig;
