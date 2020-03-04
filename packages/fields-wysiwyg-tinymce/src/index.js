import { dirname } from 'path';
import express from 'express';
import { Text } from '@k5js/fields';
import { importView } from '@k5js/build-field-types';
import { WysiwygImplementation } from './Implementation';

function prepareMiddleware() {
  const tinymcePath = dirname(require.resolve('tinymce'));
  const app = express();
  app.use('/tinymce-assets', express.static(tinymcePath));
  return app;
}

export let Wysiwyg = {
  type: 'Wysiwyg',
  implementation: WysiwygImplementation,
  views: {
    Controller: Text.views.Controller,
    Field: importView('./views/Field'),
    Filter: Text.views.Filter,
  },
  adapters: Text.adapters,
  prepareMiddleware,
};
