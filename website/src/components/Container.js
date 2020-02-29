/** @jsx jsx */

import React from 'react'; // eslint-disable-line no-unused-vars
import { jsx } from '@emotion/core';
import { mq } from '../utils/media';
import { gridSize } from '@k5ui/theme';

export const CONTAINER_GUTTERS = [gridSize * 2, gridSize * 3, gridSize * 4];
export const CONTAINER_WIDTH = 1140;

export const Container = props => (
  <div
    css={mq({
      boxSizing: 'border-box',
      marginLeft: 'auto',
      marginRight: 'auto',
      maxWidth: CONTAINER_WIDTH,
      paddingLeft: CONTAINER_GUTTERS,
      paddingRight: CONTAINER_GUTTERS,
    })}
    {...props}
  />
);
