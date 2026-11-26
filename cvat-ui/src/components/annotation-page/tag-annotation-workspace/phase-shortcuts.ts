// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { t } from 'i18n';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import { ShortcutScope } from 'utils/enums';
import { getKeyfromCode, isModifier } from 'utils/key-code-mapper';
import { KeyMap } from 'utils/mousetrap-react';

export const ACTION_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
export const actionShortcutID = (slot: number): string => `VIDEO_ACTION_${slot + 1}`;

const shortcut = (name: string, description: string, sequence: string): KeyMap[string] => ({
    name, description, sequences: [sequence], scope: ShortcutScope.VIDEO_UNDERSTANDING,
});

export const phaseShortcuts: KeyMap = {
    VIDEO_ACTION_TOGGLE: shortcut(t('Toggle action recording'), t('Start or confirm recording on the selected action track'), 'm'),
    VIDEO_ACTION_HOLD: shortcut(t('Hold to play and record'), t('Play and record the selected action until the key is released'), 'shift+m'),
    VIDEO_EXTEND_EDGE: shortcut(t('Extend action edge'), t('Extend the selected or hovered clip edge one frame'), '+'),
    VIDEO_TRIM_EDGE: shortcut(t('Trim action edge'), t('Trim the selected or hovered clip edge one frame'), '-'),
    VIDEO_PLAYBACK_TRACK: shortcut(t('Select playback track'), t('Return to the playback track at the current frame'), 'r'),
    ...Object.fromEntries(ACTION_KEYS.map((key, index) => [
        actionShortcutID(index), shortcut(t('Action track {{value1}}', { value1: index + 1 }), t('Select and record the action in this slot'), key),
    ])),
};

registerComponentShortcuts(phaseShortcuts);

export function getShortcutCombination(event: KeyboardEvent): string | null {
    const key = getKeyfromCode(event.code);
    if (!key || isModifier(key)) return null;
    return [
        event.ctrlKey ? 'ctrl' : '',
        event.altKey ? 'alt' : '',
        event.shiftKey ? 'shift' : '',
        event.metaKey ? 'command' : '',
        key,
    ].filter(Boolean).join('+');
}
