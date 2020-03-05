/** @jsx jsx */
import { jsx } from '@emotion/core';
import { Fragment, useState } from 'react';
import copyToClipboard from 'clipboard-copy';

import { KebabHorizontalIcon, LinkIcon, TrashcanIcon } from '@arch-ui/icons';
import Dropdown from '@arch-ui/dropdown';
import { Button } from '@arch-ui/button';

import DeleteItemModal from './DeleteItemModal';
import { useListData, useList } from '../providers/List';
import { useItem } from '../providers/Item';

const ItemDropDown = ({ useCopy = true, useDelete = true, items: additionalItems = [] }) => {
  const [deleteModalIsVisible, setDeleteModal] = useState(false);
  const { query, linkFn: link } = useListData();
  const item = useItem();
  const { list } = useList();

  const copyText = window.location.origin + link({ path: list.path, item });

  const handleDelete = () => {
    query.refetch();
    setDeleteModal(false);
  };

  const items = [
    ...(useCopy
      ? [
          {
            content: 'Copy Link',
            icon: <LinkIcon />,
            onClick: () => copyToClipboard(copyText),
          },
        ]
      : []),
    ...(useDelete
      ? [
          {
            content: 'Delete',
            icon: <TrashcanIcon />,
            onClick: () => setDeleteModal(true),
          },
        ]
      : []),
    ...additionalItems,
  ];
  return (
    <Fragment>
      <DeleteItemModal
        isOpen={deleteModalIsVisible}
        item={item}
        list={list}
        onClose={() => setDeleteModal(false)}
        onDelete={handleDelete}
      />
      <Dropdown
        align="right"
        target={handlers => (
          <Button
            variant="subtle"
            css={{
              opacity: 0,
              transition: 'opacity 150ms',
              'tr:hover > td > &': { opacity: 1 },
            }}
            {...handlers}
          >
            <KebabHorizontalIcon />
          </Button>
        )}
        items={items}
      />
    </Fragment>
  );
};

export default ItemDropDown;
