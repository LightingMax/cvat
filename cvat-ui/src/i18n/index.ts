// Copyright (C) CVAT Minus contributors
//
// SPDX-License-Identifier: MIT

import i18next from 'i18next';
import dayjs from 'dayjs';
import enUS from 'antd/lib/locale/en_US';
import zhHans from 'antd/lib/locale/zh_CN';
import 'dayjs/locale/zh-cn';

import zhCN from './locales/zh-CN.json';

export const languages = {
    en: { name: 'English', components: enUS, dates: 'en' },
    'zh-CN': { name: '简体中文', components: zhHans, dates: 'zh-cn' },
};

export type Language = keyof typeof languages;

export function isLanguage(value: string): value is Language {
    return Object.prototype.hasOwnProperty.call(languages, value);
}

const storageKey = 'cvat-ui-language';
const saved = localStorage.getItem(storageKey);
const preferred = navigator.languages?.[0] || navigator.language;
const browserLanguage: Language = /^zh($|-(Hans|CN|SG)\b)/i.test(preferred) ? 'zh-CN' : 'en';
export const language = saved && isLanguage(saved) ? saved : browserLanguage;

const instance = i18next.createInstance();
instance.init({
    lng: language,
    fallbackLng: 'en',
    resources: { en: { translation: {} }, 'zh-CN': { translation: zhCN } },
    keySeparator: false,
    nsSeparator: false,
    initImmediate: false,
    interpolation: { escapeValue: false },
});
document.documentElement.lang = language;
dayjs.locale(languages[language].dates);

export function t(message: string, values?: Record<string, string | number>): string {
    return instance.t(message, values);
}

export function selectLanguage(next: Language): void {
    if (language !== next) {
        localStorage.setItem(storageKey, next);
        window.location.reload();
    }
}
