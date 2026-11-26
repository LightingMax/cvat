// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { t } from 'i18n';
import React from 'react';
import Text from 'antd/lib/typography/Text';
import Empty from 'antd/lib/empty';

function EmptyListComponent(): JSX.Element {
    return (
        <div className='cvat-empty-members-list'>
            <Empty description={<Text strong>{t('No results matched your search...')}</Text>} />
        </div>
    );
}

export default React.memo(EmptyListComponent);
