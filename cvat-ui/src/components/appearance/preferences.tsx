// Copyright (C) CVAT Minus contributors
//
// SPDX-License-Identifier: MIT

import React, { useSyncExternalStore } from 'react';
import ConfigProvider from 'antd/lib/config-provider';
import theme from 'antd/lib/theme';
import { language, languages } from 'i18n';

export type Appearance = 'system' | 'light' | 'dark';
const key = 'cvat-ui-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const changed = 'cvat-theme-change';

export function appearance(): Appearance {
    const saved = localStorage.getItem(key);
    return saved === 'dark' || saved === 'light' ? saved : 'system';
}

function isDark(): boolean {
    return appearance() === 'dark' || (appearance() === 'system' && media.matches);
}

function applyTheme(): void {
    document.documentElement.dataset.cvatTheme = isDark() ? 'dark' : 'light';
}

applyTheme();
media.addEventListener('change', applyTheme);
window.addEventListener('storage', applyTheme);

export function selectAppearance(value: Appearance): void {
    localStorage.setItem(key, value);
    applyTheme();
    window.dispatchEvent(new Event(changed));
}

function subscribe(callback: () => void): () => void {
    media.addEventListener('change', callback);
    window.addEventListener(changed, callback);
    window.addEventListener('storage', callback);
    return () => {
        media.removeEventListener('change', callback);
        window.removeEventListener(changed, callback);
        window.removeEventListener('storage', callback);
    };
}

export function useAppearance(): Appearance {
    return useSyncExternalStore(subscribe, appearance);
}

export function InterfaceProvider({ children }: React.PropsWithChildren): JSX.Element {
    const dark = useSyncExternalStore(subscribe, isDark);
    return (
        <ConfigProvider
            locale={languages[language].components}
            theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}
        >
            {children}
        </ConfigProvider>
    );
}

ConfigProvider.config({ holderRender: (children) => <InterfaceProvider>{children}</InterfaceProvider> });
