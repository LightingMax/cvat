// Copyright (C) CVAT Minus contributors
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { GlobalOutlined } from '@ant-design/icons';
import Button from 'antd/lib/button';
import Dropdown from 'antd/lib/dropdown';
import {
    isLanguage, language, languages, selectLanguage, t,
} from 'i18n';
import { selectAppearance, useAppearance } from './preferences';

export default function AppearanceMenu(): JSX.Element {
    const currentAppearance = useAppearance();
    return (
        <Dropdown
            trigger={['click']}
            placement='bottomRight'
            menu={{
                selectable: true,
                selectedKeys: [language, currentAppearance],
                items: [
                    {
                        type: 'group',
                        label: t('Language'),
                        children: Object.entries(languages).map(([key, { name }]) => ({ key, label: name })),
                    },
                    {
                        type: 'group',
                        label: t('Appearance'),
                        children: [
                            { key: 'system', label: t('Use system theme') },
                            { key: 'light', label: t('Light') },
                            { key: 'dark', label: t('Dark') },
                        ],
                    },
                ],
                onClick: ({ key }) => {
                    if (isLanguage(key)) selectLanguage(key);
                    if (key === 'system' || key === 'light' || key === 'dark') selectAppearance(key);
                },
            }}
        >
            <Button
                className='cvat-appearance-menu'
                type='text'
                aria-label={t('Language and appearance')}
                title={t('Language and appearance')}
                icon={<GlobalOutlined />}
            />
        </Dropdown>
    );
}
