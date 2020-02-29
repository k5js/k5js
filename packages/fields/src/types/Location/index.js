import { Location, MongoLocationInterface, KnexLocationInterface } from './Implementation';
import { importView } from '@k5js/build-field-types';

export default {
  type: 'Location',
  implementation: Location,
  views: {
    Controller: importView('./views/Controller'),
    Field: importView('./views/Field'),
    Cell: importView('./views/Cell'),
    Filter: importView('../Text/views/Filter'),
  },
  adapters: {
    mongoose: MongoLocationInterface,
    knex: KnexLocationInterface,
  },
};
