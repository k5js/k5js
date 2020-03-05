import React, { Fragment } from 'react';
import styled from '@emotion/styled';

import { FlexGroup } from '@arch-ui/layout';
import { colors, gridSize } from '@arch-ui/theme';

import { useUIHooks } from '../../providers/Hooks';
import DeleteItems from '../../components/DeleteItems';
import UpdateItems from '../../components/UpdateItems';

export const ManageToolbar = styled.div(({ isVisible }) => ({
  height: 35,
  marginBottom: gridSize * 2,
  marginTop: gridSize,
  visibility: isVisible ? 'visible' : 'hidden',
}));
const SelectedCount = styled.div({
  color: colors.N40,
  marginRight: gridSize,
});

export default function ListManage({ pageSize, totalItems, selectedItems }) {
  const { listManageActions } = useUIHooks();
  const selectedCount = selectedItems.length;

  return (
    <Fragment>
      <FlexGroup align="center">
        <SelectedCount>
          {selectedCount} of {Math.min(pageSize, totalItems)} Selected
        </SelectedCount>
        {listManageActions ? (
          listManageActions()
        ) : (
          <Fragment>
            <UpdateItems />
            <DeleteItems />
          </Fragment>
        )}
      </FlexGroup>
    </Fragment>
  );
}
