import { Select, MongoSelectInterface, KnexSelectInterface } from './Implementation';
import { importView } from '@k5js/build-field-types';

export default {
  type: 'Select',
  implementation: Select,
  views: {
    Controller: importView('./views/Controller'),
    Field: importView('./views/Field'),
    Filter: importView('./views/Filter'),
    Cell: importView('./views/Cell'),
  },
  adapters: {
    mongoose: MongoSelectInterface,
    knex: KnexSelectInterface,
  },
};
