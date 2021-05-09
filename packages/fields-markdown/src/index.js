import path from 'path';
import { Text } from '@k5js/fields';

const pkgDir = path.dirname(require.resolve('@k5js/fields-markdown/package.json'));

export let Markdown = {
  type: 'Markdown',
  implementation: Text.implementation,
  views: {
    Controller: Text.views.Controller,
    Field: path.join(pkgDir, 'views/Field'),
    Filter: Text.views.Filter,
  },
  adapters: Text.adapters,
};
