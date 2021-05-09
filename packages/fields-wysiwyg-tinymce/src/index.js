import { dirname, join } from 'path';
import express from 'express';
import { Text } from '@k5js/fields';
import { WysiwygImplementation } from './Implementation';

function prepareMiddleware() {
  const tinymcePath = dirname(require.resolve('tinymce'));
  const app = express();
  app.use('/tinymce-assets', express.static(tinymcePath));
  return app;
}

const pkgDir = dirname(require.resolve('@k5js/fields-wysiwyg-tinymce/package.json'));

export let Wysiwyg = {
  type: 'Wysiwyg',
  implementation: WysiwygImplementation,
  views: {
    Controller: Text.views.Controller,
    Field: join(pkgDir, 'views/Field'),
    Filter: Text.views.Filter,
  },
  adapters: Text.adapters,
  prepareMiddleware,
};
