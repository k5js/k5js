const { Keystone } = require('@k5js/keystone');
const { PasswordAuthStrategy } = require('@k5js/auth-password');
const { Text, Password, Relationship, Checkbox } = require('@k5js/fields');
const { MongooseAdapter } = require('@k5js/adapter-mongoose');
const { GraphQLApp } = require('@k5js/app-graphql');
const { AdminUIApp } = require('@k5js/app-admin-ui');

const {
  createdAt,
  createdBy,
  updatedAt,
  updatedBy,
  atTracking,
  byTracking,
} = require('@k5js/list-plugins');

const defaultAccess = ({ authentication: { item } }) => !!item;

const keystone = new Keystone({
  name: 'Cypress Test Project For Login',
  adapter: new MongooseAdapter(),
  defaultAccess: {
    list: defaultAccess,
  },
});

keystone.createList('User', {
  fields: {
    name: { type: Text },
    email: { type: Text },
    password: { type: Password },
    isAdmin: { type: Checkbox },
  },
  labelResolver: item => `${item.name} <${item.email}>`,
  access: {
    create: defaultAccess,
    read: defaultAccess,
    update: defaultAccess,
    delete: defaultAccess,
    auth: true,
  },
});

keystone.createList('Post', {
  fields: {
    title: { type: Text },
    author: { type: Relationship, ref: 'User' },
    editors: { type: Relationship, ref: 'User', many: true },
  },
});

keystone.createList('ListWithPlugin', {
  fields: {
    text: { type: Text },
  },
  plugins: [
    atTracking(),
    createdAt({ createdAtField: 'whenCreated' }),
    updatedAt({ updatedAtField: 'whenUpdated' }),
    byTracking({
      createdByField: 'creator',
      updatedByField: 'updater',
    }),
    createdBy(),
    updatedBy(),
  ],
});

const authStrategy = keystone.createAuthStrategy({
  type: PasswordAuthStrategy,
  list: 'User',
  // config: { protectIdentities: true },
});

module.exports = {
  keystone,
  apps: [
    new GraphQLApp(),
    new AdminUIApp({
      adminPath: '/admin',
      authStrategy,
      isAccessAllowed: ({ authentication: { item, listKey } }) =>
        !!item && listKey === 'User' && !!item.isAdmin,
    }),
  ],
};
