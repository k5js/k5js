const { Keystone } = require('@k5js/keystone');
const { KnexAdapter } = require('@k5js/adapter-knex');
const { Text } = require('@k5js/fields');
const { GraphQLApp } = require('@k5js/app-graphql');
const { AdminUIApp } = require('@k5js/app-admin-ui');
const { StaticApp } = require('@k5js/app-static');

const keystone = new Keystone({
  adapter: new KnexAdapter({ knexOptions: { connection: 'postgres://localhost/to-do' } }),
});

keystone.createList('Todo', {
  schemaDoc: 'A list of things which need to be done',
  fields: {
    name: { type: Text, schemaDoc: 'This is the thing you need to do', isRequired: true },
  },
});

module.exports = {
  keystone,
  apps: [
    new GraphQLApp(),
    new StaticApp({ path: '/', src: 'public' }),
    // Setup the optional Admin UI
    new AdminUIApp({ name: 'Keystone To-Do List', enableDefaultRoute: true }),
  ],
};
