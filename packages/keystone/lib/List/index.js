const pluralize = require('pluralize');
const {
  resolveAllKeys,
  mapKeys,
  omit,
  omitBy,
  unique,
  intersection,
  mergeWhereClause,
  objMerge,
  arrayToObject,
  flatten,
  zipObj,
  createLazyDeferred,
} = require('@k5js/utils');
const { parseListAccess } = require('@k5js/access-control');
const { logger } = require('@k5js/logger');

const graphqlLogger = logger('graphql');
const keystoneLogger = logger('keystone');

const {
  LimitsExceededError,
  ValidationFailureError,
  throwAccessDenied,
} = require('./graphqlErrors');

const upcase = str => str.substr(0, 1).toUpperCase() + str.substr(1);

const preventInvalidUnderscorePrefix = str => str.replace(/^__/, '_');

const keyToLabel = str => {
  let label = str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s|_|\-/)
    .filter(i => i)
    .map(upcase)
    .join(' ');

  // Retain the leading underscore for auxiliary lists
  if (str[0] === '_') {
    label = `_${label}`;
  }
  return label;
};

const labelToPath = str =>
  str
    .split(' ')
    .join('-')
    .toLowerCase();

const labelToClass = str => str.replace(/\s+/g, '');

const opToType = {
  read: 'query',
  create: 'mutation',
  update: 'mutation',
  delete: 'mutation',
};

const mapNativeTypeToKeystoneType = (type, listKey, fieldPath) => {
  const { Text, Checkbox, Float } = require('@k5js/fields');

  const nativeTypeMap = new Map([
    [
      Boolean,
      {
        name: 'Boolean',
        keystoneType: Checkbox,
      },
    ],
    [
      String,
      {
        name: 'String',
        keystoneType: Text,
      },
    ],
    [
      Number,
      {
        name: 'Number',
        keystoneType: Float,
      },
    ],
  ]);

  if (!nativeTypeMap.has(type)) {
    return type;
  }

  const { name, keystoneType } = nativeTypeMap.get(type);

  keystoneLogger.warn(
    { nativeType: type, keystoneType, listKey, fieldPath },
    `Mapped field ${listKey}.${fieldPath} from native JavaScript type '${name}', to '${keystoneType.type.type}' from the @keystonejs/fields package.`
  );

  return keystoneType;
};

const getDefautlLabelResolver = labelField => item => {
  const value = item[labelField || 'name'];
  if (typeof value === 'number') {
    return value.toString();
  }
  return value || item.id;
};

module.exports = class List {
  constructor(
    key,
    {
      fields,
      hooks = {},
      schemaDoc,
      labelResolver,
      labelField,
      access,
      adminConfig = {},
      itemQueryName,
      listQueryName,
      label,
      singular,
      plural,
      path,
      adapterConfig = {},
      queryLimits = {},
      cacheHint,
    },
    {
      getListByKey,
      queryHelper,
      adapter,
      defaultAccess,
      registerType,
      createAuxList,
      isAuxList,
      schemaNames,
    }
  ) {
    this.key = key;
    this._fields = fields;
    this.hooks = hooks;
    this.schemaDoc = schemaDoc;

    // Assuming the id column shouldn't be included in default columns or sort
    const nonIdFieldNames = Object.keys(fields).filter(k => k !== 'id');
    this.adminConfig = {
      defaultPageSize: 50,
      defaultColumns: nonIdFieldNames ? nonIdFieldNames.slice(0, 2).join(',') : 'id',
      defaultSort: nonIdFieldNames.length ? nonIdFieldNames[0] : '',
      maximumPageSize: 1000,
      ...adminConfig,
    };

    this.labelResolver = labelResolver || getDefautlLabelResolver(labelField);
    this.isAuxList = isAuxList;
    this.getListByKey = getListByKey;
    this.defaultAccess = defaultAccess;

    const _label = keyToLabel(key);
    const _singular = pluralize.singular(_label);
    const _plural = pluralize.plural(_label);

    if (_plural === _label) {
      throw new Error(
        `Unable to use ${_label} as a List name - it has an ambiguous plural (${_plural}). Please choose another name for your list.`
      );
    }

    this.adminUILabels = {
      label: label || _plural,
      singular: singular || _singular,
      plural: plural || _plural,
      path: path || labelToPath(_plural),
    };

    const _itemQueryName = itemQueryName || labelToClass(_singular);
    const _listQueryName = listQueryName || labelToClass(_plural);

    this.gqlNames = {
      outputTypeName: this.key,
      itemQueryName: _itemQueryName,
      listQueryName: `all${_listQueryName}`,
      listQueryMetaName: `_all${_listQueryName}Meta`,
      listMetaName: preventInvalidUnderscorePrefix(`_${_listQueryName}Meta`),
      deleteMutationName: `delete${_itemQueryName}`,
      updateMutationName: `update${_itemQueryName}`,
      createMutationName: `create${_itemQueryName}`,
      deleteManyMutationName: `delete${_listQueryName}`,
      updateManyMutationName: `update${_listQueryName}`,
      createManyMutationName: `create${_listQueryName}`,
      whereInputName: `${_itemQueryName}WhereInput`,
      whereUniqueInputName: `${_itemQueryName}WhereUniqueInput`,
      updateInputName: `${_itemQueryName}UpdateInput`,
      createInputName: `${_itemQueryName}CreateInput`,
      updateManyInputName: `${_listQueryName}UpdateInput`,
      createManyInputName: `${_listQueryName}CreateInput`,
      relateToManyInputName: `${_itemQueryName}RelateToManyInput`,
      relateToOneInputName: `${_itemQueryName}RelateToOneInput`,
    };

    this.adapterName = adapter.name;
    this.adapter = adapter.newListAdapter(this.key, adapterConfig);
    this._schemaNames = schemaNames;

    this.access = parseListAccess({
      schemaNames: this._schemaNames,
      listKey: key,
      access,
      defaultAccess: this.defaultAccess.list,
    });

    this.queryLimits = {
      maxResults: Infinity,
      ...queryLimits,
    };
    if (this.queryLimits.maxResults < 1) {
      throw new Error(`List ${label}'s queryLimits.maxResults can't be < 1`);
    }

    if (!['object', 'function', 'undefined'].includes(typeof cacheHint)) {
      throw new Error(`List ${label}'s cacheHint must be an object or function`);
    }
    this.cacheHint = cacheHint;

    this.hooksActions = {
      /**
       * @param queryString String A graphQL query string
       * @param options.skipAccessControl Boolean By default access control _of
       * the user making the initial request_ is still tested. Disable all
       * Access Control checks with this flag
       * @param options.variables Object The variables passed to the graphql
       * query for the given queryString.
       *
       * @return Promise<Object> The graphql query response
       */
      query: queryHelper,
    };

    // Tell Keystone about all the types we've seen
    Object.values(fields).forEach(({ type }) => registerType(type));

    this.createAuxList = (auxKey, auxConfig) =>
      createAuxList(auxKey, {
        access: Object.entries(this.access).reduce(
          (acc, [schemaName, access]) => ({
            ...acc,
            [schemaName]: Object.entries(access).reduce(
              (acc, [op, rule]) => ({ ...acc, [op]: !!rule }), // Reduce the entries to truthy values
              {}
            ),
          }),
          {}
        ),
        ...auxConfig,
      });
  }

  initFields() {
    if (this.fieldsInitialised) return;
    this.fieldsInitialised = true;

    let sanitisedFieldsConfig = mapKeys(this._fields, (fieldConfig, path) => ({
      ...fieldConfig,
      type: mapNativeTypeToKeystoneType(fieldConfig.type, this.key, path),
    }));

    // Add an 'id' field if none supplied
    if (!sanitisedFieldsConfig.id) {
      if (typeof this.adapter.parentAdapter.getDefaultPrimaryKeyConfig !== 'function') {
        throw `No 'id' field given for the '${this.key}' list and the list adapter ` +
          `in used (${this.adapter.key}) doesn't supply a default primary key config ` +
          `(no 'getDefaultPrimaryKeyConfig()' function)`;
      }
      // Rebuild the object so id is "first"
      sanitisedFieldsConfig = {
        id: this.adapter.parentAdapter.getDefaultPrimaryKeyConfig(),
        ...sanitisedFieldsConfig,
      };
    }

    // Helpful errors for misconfigured lists
    Object.entries(sanitisedFieldsConfig).forEach(([fieldKey, fieldConfig]) => {
      if (!this.isAuxList && fieldKey[0] === '_') {
        throw `Invalid field name "${fieldKey}". Field names cannot start with an underscore.`;
      }
      if (typeof fieldConfig.type === 'undefined') {
        throw `The '${this.key}.${fieldKey}' field doesn't specify a valid type. ` +
          `(${this.key}.${fieldKey}.type is undefined)`;
      }
      const adapters = fieldConfig.type.adapters;
      if (typeof adapters === 'undefined' || Object.entries(adapters).length === 0) {
        throw `The type given for the '${this.key}.${fieldKey}' field doesn't define any adapters.`;
      }
    });

    Object.values(sanitisedFieldsConfig).forEach(({ type }) => {
      if (!type.adapters[this.adapterName]) {
        throw `Adapter type "${this.adapterName}" does not support field type "${type.type}"`;
      }
    });

    this.fieldsByPath = mapKeys(
      sanitisedFieldsConfig,
      ({ type, ...fieldSpec }, path) =>
        new type.implementation(path, fieldSpec, {
          getListByKey: this.getListByKey,
          listKey: this.key,
          listAdapter: this.adapter,
          fieldAdapterClass: type.adapters[this.adapterName],
          defaultAccess: this.defaultAccess.field,
          createAuxList: this.createAuxList,
          schemaNames: this._schemaNames,
        })
    );
    this.fields = Object.values(this.fieldsByPath);
    this.views = mapKeys(sanitisedFieldsConfig, ({ type }, path) =>
      this.fieldsByPath[path].extendAdminViews({ ...type.views })
    );
  }

  getAdminMeta({ schemaName }) {
    const schemaAccess = this.access[schemaName];
    const {
      defaultPageSize,
      defaultColumns,
      defaultSort,
      maximumPageSize,
      ...adminConfig
    } = this.adminConfig;
    return {
      key: this.key,
      // Reduce to truthy values (functions can't be passed over the webpack
      // boundary)
      access: mapKeys(schemaAccess, val => !!val),
      label: this.adminUILabels.label,
      singular: this.adminUILabels.singular,
      plural: this.adminUILabels.plural,
      path: this.adminUILabels.path,
      gqlNames: this.gqlNames,
      fields: this.fields
        .filter(field => field.access[schemaName].read)
        .map(field => field.getAdminMeta({ schemaName })),
      views: this.views,
      adminConfig: {
        defaultPageSize,
        defaultColumns: defaultColumns.replace(/\s/g, ''), // remove all whitespace
        defaultSort: defaultSort,
        maximumPageSize: Math.max(defaultPageSize, maximumPageSize),
        ...adminConfig,
      },
    };
  }

  getFieldsWithAccess({ schemaName, access }) {
    return this.fields
      .filter(({ path }) => path !== 'id') // Exclude the id fields update types
      .filter(field => field.access[schemaName][access]); // If it's globally set to false, makes sense to never let it be updated
  }

  getGqlTypes({ schemaName }) {
    const schemaAccess = this.access[schemaName];
    // https://github.com/opencrud/opencrud/blob/master/spec/2-relational/2-2-queries/2-2-3-filters.md#boolean-expressions
    const types = [];
    if (
      schemaAccess.read ||
      schemaAccess.create ||
      schemaAccess.update ||
      schemaAccess.delete ||
      schemaAccess.auth
    ) {
      types.push(
        ...flatten(this.fields.map(field => field.getGqlAuxTypes({ schemaName }))),
        `
        """ ${this.schemaDoc || 'A keystone list'} """
        type ${this.gqlNames.outputTypeName} {
          """
          This virtual field will be resolved in one of the following ways (in this order):
           1. Execution of 'labelResolver' set on the ${this.key} List config, or
           2. As an alias to the field set on 'labelField' in the ${this.key} List config, or
           3. As an alias to a 'name' field on the ${this.key} List (if one exists), or
           4. As an alias to the 'id' field on the ${this.key} List.
          """
          _label_: String
          ${flatten(
            this.fields
              .filter(field => field.access[schemaName].read) // If it's globally set to false, makes sense to never show it
              .map(field =>
                field.schemaDoc
                  ? `""" ${field.schemaDoc} """ ${field.gqlOutputFields({ schemaName })}`
                  : field.gqlOutputFields({ schemaName })
              )
          ).join('\n')}
        }
      `,
        `
        input ${this.gqlNames.whereInputName} {
          AND: [${this.gqlNames.whereInputName}]
          OR: [${this.gqlNames.whereInputName}]

          ${flatten(
            this.fields
              .filter(field => field.access[schemaName].read) // If it's globally set to false, makes sense to never show it
              .map(field => field.gqlQueryInputFields({ schemaName }))
          ).join('\n')}
        }`,
        // TODO: Include other `unique` fields and allow filtering by them
        `
        input ${this.gqlNames.whereUniqueInputName} {
          id: ID!
        }`
      );
    }

    const updateFields = this.getFieldsWithAccess({ schemaName, access: 'update' });
    if (schemaAccess.update && updateFields.length) {
      types.push(`
        input ${this.gqlNames.updateInputName} {
          ${flatten(updateFields.map(field => field.gqlUpdateInputFields)).join('\n')}
        }
      `);
      types.push(`
        input ${this.gqlNames.updateManyInputName} {
          id: ID!
          data: ${this.gqlNames.updateInputName}
        }
      `);
    }

    const createFields = this.getFieldsWithAccess({ schemaName, access: 'create' });
    if (schemaAccess.create && createFields.length) {
      types.push(`
        input ${this.gqlNames.createInputName} {
          ${flatten(createFields.map(field => field.gqlCreateInputFields)).join('\n')}
        }
      `);
      types.push(`
        input ${this.gqlNames.createManyInputName} {
          data: ${this.gqlNames.createInputName}
        }
      `);
    }

    return types;
  }

  getGraphqlFilterFragment() {
    return [
      `where: ${this.gqlNames.whereInputName}`,
      `search: String`,
      `orderBy: String`,
      `first: Int`,
      `skip: Int`,
    ];
  }

  getGqlQueries({ schemaName }) {
    const schemaAccess = this.access[schemaName];
    // All the auxiliary queries the fields want to add
    const queries = flatten(this.fields.map(field => field.getGqlAuxQueries()));

    // If `read` is either `true`, or a function (we don't care what the result
    // of the function is, that'll get executed at a later time)
    if (schemaAccess.read) {
      queries.push(
        `
        """ Search for all ${this.gqlNames.outputTypeName} items which match the where clause. """
        ${this.gqlNames.listQueryName}(
          ${this.getGraphqlFilterFragment().join('\n')}
        ): [${this.gqlNames.outputTypeName}]`,

        `
        """ Search for the ${this.gqlNames.outputTypeName} item with the matching ID. """
        ${this.gqlNames.itemQueryName}(
          where: ${this.gqlNames.whereUniqueInputName}!
        ): ${this.gqlNames.outputTypeName}`,

        `
        """ Perform a meta-query on all ${
          this.gqlNames.outputTypeName
        } items which match the where clause. """
        ${this.gqlNames.listQueryMetaName}(
          ${this.getGraphqlFilterFragment().join('\n')}
        ): _QueryMeta`,

        `
        """ Retrieve the meta-data for the ${this.gqlNames.itemQueryName} list. """
        ${this.gqlNames.listMetaName}: _ListMeta`
      );
    }

    return queries;
  }

  getFieldsRelatedTo(listKey) {
    return this.fields.filter(
      ({ isRelationship, refListKey }) => isRelationship && refListKey === listKey
    );
  }

  // Wrap the "inner" resolver for a single output field with list-specific modifiers
  _wrapFieldResolver(field, innerResolver) {
    return (item, args, context, info) => {
      // Check access
      const operation = 'read';
      const access = context.getFieldAccessControlForUser(
        this.key,
        field.path,
        undefined,
        item,
        operation
      );
      if (!access) {
        // If the client handles errors correctly, it should be able to
        // receive partial data (for the fields the user has access to),
        // and then an `errors` array of AccessDeniedError's
        throwAccessDenied(opToType[operation], context, field.path, {
          itemId: item ? item.id : null,
        });
      }

      // Only static cache hints are supported at the field level until a use-case makes it clear what parameters a dynamic hint would take
      if (field.config.cacheHint && info && info.cacheControl) {
        info.cacheControl.setCacheHint(field.config.cacheHint);
      }

      // Execute the original/inner resolver
      return innerResolver(item, args, context, info);
    };
  }

  gqlFieldResolvers({ schemaName }) {
    const schemaAccess = this.access[schemaName];
    if (!schemaAccess.read) {
      return {};
    }
    const fieldResolvers = {
      // TODO: The `_label_` output field currently circumvents access control
      _label_: this.labelResolver,
      ...objMerge(
        this.fields
          .filter(field => field.access[schemaName].read)
          .map(field =>
            // Get the resolvers for the (possibly multiple) output fields and wrap each with list-specific modifiers
            mapKeys(field.gqlOutputFieldResolvers({ schemaName }), innerResolver =>
              this._wrapFieldResolver(field, innerResolver)
            )
          )
      ),
    };
    return { [this.gqlNames.outputTypeName]: fieldResolvers };
  }

  gqlAuxFieldResolvers({ schemaName }) {
    const schemaAccess = this.access[schemaName];
    if (
      schemaAccess.read ||
      schemaAccess.create ||
      schemaAccess.update ||
      schemaAccess.delete ||
      schemaAccess.auth
    ) {
      return objMerge(this.fields.map(field => field.gqlAuxFieldResolvers({ schemaName })));
    }
    return {};
  }

  gqlAuxQueryResolvers() {
    // TODO: Obey the same ACL rules based on parent type
    return objMerge(this.fields.map(field => field.gqlAuxQueryResolvers()));
  }

  gqlAuxMutationResolvers() {
    // TODO: Obey the same ACL rules based on parent type
    return objMerge(this.fields.map(field => field.gqlAuxMutationResolvers()));
  }

  getGqlMutations({ schemaName }) {
    const schemaAccess = this.access[schemaName];
    const mutations = flatten(this.fields.map(field => field.getGqlAuxMutations()));

    // NOTE: We only check for truthy as it could be `true`, or a function (the
    // function is executed later in the resolver)

    const createFields = this.getFieldsWithAccess({ schemaName, access: 'create' });
    if (schemaAccess.create && createFields.length) {
      mutations.push(`
        """ Create a single ${this.gqlNames.outputTypeName} item. """
        ${this.gqlNames.createMutationName}(
          data: ${this.gqlNames.createInputName}
        ): ${this.gqlNames.outputTypeName}
      `);

      mutations.push(`
        """ Create multiple ${this.gqlNames.outputTypeName} items. """
        ${this.gqlNames.createManyMutationName}(
          data: [${this.gqlNames.createManyInputName}]
        ): [${this.gqlNames.outputTypeName}]
      `);
    }

    const updateFields = this.getFieldsWithAccess({ schemaName, access: 'update' });
    if (schemaAccess.update && updateFields.length) {
      mutations.push(`
      """ Update a single ${this.gqlNames.outputTypeName} item by ID. """
        ${this.gqlNames.updateMutationName}(
          id: ID!
          data: ${this.gqlNames.updateInputName}
        ): ${this.gqlNames.outputTypeName}
      `);

      mutations.push(`
      """ Update multiple ${this.gqlNames.outputTypeName} items by ID. """
        ${this.gqlNames.updateManyMutationName}(
          data: [${this.gqlNames.updateManyInputName}]
        ): [${this.gqlNames.outputTypeName}]
      `);
    }

    if (schemaAccess.delete) {
      mutations.push(`
        """ Delete a single ${this.gqlNames.outputTypeName} item by ID. """
        ${this.gqlNames.deleteMutationName}(
          id: ID!
        ): ${this.gqlNames.outputTypeName}
      `);

      mutations.push(`
        """ Delete multiple ${this.gqlNames.outputTypeName} items by ID. """
        ${this.gqlNames.deleteManyMutationName}(
          ids: [ID!]
        ): [${this.gqlNames.outputTypeName}]
      `);
    }

    return mutations;
  }

  checkFieldAccess(operation, itemsToUpdate, context, { gqlName, extraData = {} }) {
    const restrictedFields = [];

    itemsToUpdate.forEach(({ existingItem, data }) => {
      this.fields
        .filter(field => field.path in data)
        .forEach(field => {
          const access = context.getFieldAccessControlForUser(
            this.key,
            field.path,
            data,
            existingItem,
            operation
          );
          if (!access) {
            restrictedFields.push(field.path);
          }
        });
    });
    if (restrictedFields.length) {
      throwAccessDenied(opToType[operation], context, gqlName, extraData, { restrictedFields });
    }
  }

  checkListAccess(context, originalInput, operation, { gqlName, ...extraInternalData }) {
    const access = context.getListAccessControlForUser(this.key, originalInput, operation, {
      gqlName,
      ...extraInternalData,
    });
    if (!access) {
      graphqlLogger.debug(
        { operation, access, gqlName, ...extraInternalData },
        'Access statically or implicitly denied'
      );
      graphqlLogger.info({ operation, gqlName, ...extraInternalData }, 'Access Denied');
      // If the client handles errors correctly, it should be able to
      // receive partial data (for the fields the user has access to),
      // and then an `errors` array of AccessDeniedError's
      throwAccessDenied(opToType[operation], context, gqlName, extraInternalData);
    }
    return access;
  }

  async getAccessControlledItem(id, access, { context, operation, gqlName, info }) {
    const _throwAccessDenied = msg => {
      graphqlLogger.debug({ id, operation, access, gqlName }, msg);
      graphqlLogger.info({ id, operation, gqlName }, 'Access Denied');
      // If the client handles errors correctly, it should be able to
      // receive partial data (for the fields the user has access to),
      // and then an `errors` array of AccessDeniedError's
      throwAccessDenied(opToType[operation], context, gqlName, { itemId: id });
    };

    let item;
    if (
      (access.id && access.id !== id) ||
      (access.id_not && access.id_not === id) ||
      (access.id_in && !access.id_in.includes(id)) ||
      (access.id_not_in && access.id_not_in.includes(id))
    ) {
      // It's odd, but conceivable the access control specifies a single id
      // the user has access to. So we have to do a check here to see if the
      // ID they're requesting matches that ID.
      // Nice side-effect: We can throw without having to ever query the DB.
      _throwAccessDenied('Item excluded this id from filters');
    } else {
      // NOTE: The fields will be filtered by the ACL checking in gqlFieldResolvers()
      // We only want 1 item, don't make the DB do extra work
      // NOTE: Order in where: { ... } doesn't matter, if `access.id !== id`, it will
      // have been caught earlier, so this spread and overwrite can only
      // ever be additive or overwrite with the same value
      item = (await this._itemsQuery({ first: 1, where: { ...access, id } }, { context, info }))[0];
    }
    if (!item) {
      // Throwing an AccessDenied here if the item isn't found because we're
      // strict about accidentally leaking information (that the item doesn't
      // exist)
      // NOTE: There is a potential security risk here if we were to
      // further check the existence of an item with the given ID: It'd be
      // possible to figure out if records with particular IDs exist in
      // the DB even if the user doesn't have access (eg; check a bunch of
      // IDs, and the ones that return AccessDenied exist, and the ones
      // that return null do not exist). Similar to how S3 returns 403's
      // always instead of ever returning 404's.
      // Our version is to always throw if not found.
      _throwAccessDenied('Zero items found');
    }
    // Found the item, and it passed the filter test
    return item;
  }

  async getAccessControlledItems(ids, access, { context, info } = {}) {
    if (ids.length === 0) {
      return [];
    }

    const uniqueIds = unique(ids);

    // Early out - the user has full access to operate on this list
    if (access === true) {
      return await this._itemsQuery({ where: { id_in: uniqueIds } }, { context, info });
    }

    let idFilters = {};

    if (access.id || access.id_in) {
      const accessControlIdsAllowed = unique([].concat(access.id, access.id_in).filter(id => id));

      idFilters.id_in = intersection(accessControlIdsAllowed, uniqueIds);
    } else {
      idFilters.id_in = uniqueIds;
    }

    if (access.id_not || access.id_not_in) {
      const accessControlIdsDisallowed = unique(
        [].concat(access.id_not, access.id_not_in).filter(id => id)
      );

      idFilters.id_not_in = intersection(accessControlIdsDisallowed, uniqueIds);
    }

    // It's odd, but conceivable the access control specifies a single id
    // the user has access to. So we have to do a check here to see if the
    // ID they're requesting matches that ID.
    // Nice side-effect: We can throw without having to ever query the DB.
    if (
      // Only some ids are allowed, and none of them have been passed in
      (idFilters.id_in && idFilters.id_in.length === 0) ||
      // All the passed in ids have been explicitly disallowed
      (idFilters.id_not_in && idFilters.id_not_in.length === uniqueIds.length)
    ) {
      // NOTE: We don't throw an error for multi-actions, only return an empty
      // array because there's no mechanism in GraphQL to return more than one
      // error for a list result.
      return [];
    }

    // NOTE: The fields will be filtered by the ACL checking in gqlFieldResolvers()
    // NOTE: Unlike in the single-operation variation, there is no security risk
    // in returning the result of the query here, because if no items match, we
    // return an empty array regardless of if that's because of lack of
    // permissions or because of those items don't exist.
    const remainingAccess = omit(access, ['id', 'id_not', 'id_in', 'id_not_in']);
    return await this._itemsQuery(
      { where: { ...remainingAccess, ...idFilters } },
      { context, info }
    );
  }

  gqlQueryResolvers({ schemaName }) {
    const schemaAccess = this.access[schemaName];
    let resolvers = {};

    // If set to false, we can confidently remove these resolvers entirely from
    // the graphql schema
    if (schemaAccess.read) {
      resolvers = {
        [this.gqlNames.listQueryName]: (_, args, context, info) =>
          this.listQuery(args, context, this.gqlNames.listQueryName, info),

        [this.gqlNames.listQueryMetaName]: (_, args, context, info) =>
          this.listQueryMeta(args, context, this.gqlNames.listQueryMetaName, info),

        [this.gqlNames.listMetaName]: (_, args, context) => this.listMeta(context),

        [this.gqlNames.itemQueryName]: (_, args, context, info) =>
          this.itemQuery(args, context, this.gqlNames.itemQueryName, info),
      };
    }

    return resolvers;
  }

  async listQuery(args, context, gqlName, info, from) {
    const access = this.checkListAccess(context, undefined, 'read', { gqlName });

    return this._itemsQuery(mergeWhereClause(args, access), { context, info, from });
  }

  async listQueryMeta(args, context, gqlName, info, from) {
    return {
      // Return these as functions so they're lazily evaluated depending
      // on what the user requested
      // Evaluation takes place in ../Keystone/index.js
      getCount: () => {
        const access = this.checkListAccess(context, undefined, 'read', { gqlName });

        return this._itemsQuery(mergeWhereClause(args, access), {
          meta: true,
          context,
          info,
          from,
        }).then(({ count }) => count);
      },
    };
  }

  listMeta(context) {
    return {
      name: this.key,
      // Return these as functions so they're lazily evaluated depending
      // on what the user requested
      // Evalutation takes place in ../Keystone/index.js
      // NOTE: These could return a Boolean or a JSON object (if using the
      // declarative syntax)
      getAccess: () => ({
        getCreate: () => context.getListAccessControlForUser(this.key, undefined, 'create'),
        getRead: () => context.getListAccessControlForUser(this.key, undefined, 'read'),
        getUpdate: () => context.getListAccessControlForUser(this.key, undefined, 'update'),
        getDelete: () => context.getListAccessControlForUser(this.key, undefined, 'delete'),
        getAuth: () => context.getAuthAccessControlForUser(this.key),
      }),
      getSchema: () => {
        const queries = [
          this.gqlNames.itemQueryName,
          this.gqlNames.listQueryName,
          this.gqlNames.listQueryMetaName,
        ];

        // NOTE: Other fields on this type are resolved in the main resolver in
        // ../Keystone/index.js
        return {
          type: this.gqlNames.outputTypeName,
          queries,
          key: this.key,
        };
      },
    };
  }

  async itemQuery(
    // prettier-ignore
    { where: { id } },
    context,
    gqlName,
    info
  ) {
    const operation = 'read';
    graphqlLogger.debug({ id, operation, type: opToType[operation], gqlName }, 'Start query');

    const access = this.checkListAccess(context, undefined, operation, { gqlName, itemId: id });

    const result = await this.getAccessControlledItem(id, access, {
      context,
      operation,
      gqlName,
      info,
    });

    graphqlLogger.debug({ id, operation, type: opToType[operation], gqlName }, 'End query');
    return result;
  }

  async _itemsQuery(args, extra) {
    // This is private because it doesn't handle access control

    const { maxResults } = this.queryLimits;

    const throwLimitsExceeded = args => {
      throw new LimitsExceededError({
        data: {
          list: this.key,
          ...args,
        },
      });
    };

    // Need to enforce List-specific query limits
    const { first = Infinity } = args;
    // We want to help devs by failing fast and noisily if limits are violated.
    // Unfortunately, we can't always be sure of intent.
    // E.g., if the query has a "first: 10", is it bad if more results could come back?
    // Maybe yes, or maybe the dev is just paginating posts.
    // But we can be sure there's a problem in two cases:
    // * The query explicitly has a "first" that exceeds the limit
    // * The query has no "first", and has more results than the limit
    if (first < Infinity && first > maxResults) {
      throwLimitsExceeded({ type: 'maxResults', limit: maxResults });
    }
    if (!(extra && extra.meta)) {
      // "first" is designed to truncate the count value, but accurate counts are still
      // needed for pagination.  resultsLimit is meant for protecting KS memory usage,
      // not DB performance, anyway, so resultsLimit is only applied to queries that
      // could return many results.
      // + 1 to allow limit violation detection
      const resultsLimit = Math.min(maxResults + 1, first);
      if (resultsLimit < Infinity) {
        args.first = resultsLimit;
      }
    }
    const results = await this.adapter.itemsQuery(args, extra);
    if (results.length > maxResults) {
      throwLimitsExceeded({ type: 'maxResults', limit: maxResults });
    }
    if (extra && extra.context) {
      const context = extra.context;
      context.totalResults += results.length;
      if (context.totalResults > context.maxTotalResults) {
        throwLimitsExceeded({ type: 'maxTotalResults', limit: context.maxTotalResults });
      }
    }

    if (extra && extra.info && extra.info.cacheControl) {
      switch (typeof this.cacheHint) {
        case 'object':
          extra.info.cacheControl.setCacheHint(this.cacheHint);
          break;

        case 'function':
          const operationName = extra.info.operation.name && extra.info.operation.name.value;
          extra.info.cacheControl.setCacheHint(
            this.cacheHint({ results, operationName, meta: !!extra.meta })
          );
          break;

        case 'undefined':
          break;
      }
    }

    return results;
  }

  gqlMutationResolvers({ schemaName }) {
    const schemaAccess = this.access[schemaName];
    const mutationResolvers = {};

    const createFields = this.getFieldsWithAccess({ schemaName, access: 'create' });
    if (schemaAccess.create && createFields.length) {
      mutationResolvers[this.gqlNames.createMutationName] = (_, { data }, context) =>
        this.createMutation(data, context);

      mutationResolvers[this.gqlNames.createManyMutationName] = (_, { data }, context) =>
        this.createManyMutation(data, context);
    }

    const updateFields = this.getFieldsWithAccess({ schemaName, access: 'update' });
    if (schemaAccess.update && updateFields.length) {
      mutationResolvers[this.gqlNames.updateMutationName] = (_, { id, data }, context) =>
        this.updateMutation(id, data, context);

      mutationResolvers[this.gqlNames.updateManyMutationName] = (_, { data }, context) =>
        this.updateManyMutation(data, context);
    }

    if (schemaAccess.delete) {
      mutationResolvers[this.gqlNames.deleteMutationName] = (_, { id }, context) =>
        this.deleteMutation(id, context);

      mutationResolvers[this.gqlNames.deleteManyMutationName] = (_, { ids }, context) =>
        this.deleteManyMutation(ids, context);
    }

    return mutationResolvers;
  }

  _throwValidationFailure(errors, operation, data = {}) {
    throw new ValidationFailureError({
      data: {
        messages: errors.map(e => e.msg),
        errors: errors.map(e => e.data),
        listKey: this.key,
        operation,
      },
      internalData: {
        errors: errors.map(e => e.internalData),
        data,
      },
    });
  }

  _mapToFields(fields, action) {
    return resolveAllKeys(arrayToObject(fields, 'path', action)).catch(error => {
      if (!error.errors) {
        throw error;
      }
      const errorCopy = new Error(error.message || error.toString());
      errorCopy.errors = Object.values(error.errors);
      throw errorCopy;
    });
  }

  _fieldsFromObject(obj) {
    return Object.keys(obj)
      .map(fieldPath => this.fieldsByPath[fieldPath])
      .filter(field => field);
  }

  async _resolveRelationship(data, existingItem, context, getItem, mutationState) {
    const fields = this._fieldsFromObject(data).filter(field => field.isRelationship);
    const resolvedRelationships = await this._mapToFields(fields, async field => {
      const { create, connect, disconnect, currentValue } = await field.resolveNestedOperations(
        data[field.path],
        existingItem,
        context,
        getItem,
        mutationState
      );
      // This code codifies the order of operations for nested mutations:
      // 1. disconnectAll
      // 2. disconnect
      // 3. create
      // 4. connect
      if (field.many) {
        return [
          ...currentValue.filter(id => !disconnect.includes(id)),
          ...connect,
          ...create,
        ].filter(id => !!id);
      } else {
        return create && create[0]
          ? create[0]
          : connect && connect[0]
          ? connect[0]
          : disconnect && disconnect[0]
          ? null
          : currentValue;
      }
    });

    return {
      ...data,
      ...resolvedRelationships,
    };
  }

  async _registerBacklinks(existingItem, mutationState) {
    const fields = this.fields.filter(field => field.isRelationship);
    await this._mapToFields(fields, field =>
      field.registerBacklink(existingItem[field.path], existingItem, mutationState)
    );
  }

  async _resolveDefaults({ existingItem, context, originalInput }) {
    const args = {
      existingItem,
      context,
      originalInput,
      actions: mapKeys(this.hooksActions, hook => hook(context)),
    };

    const fieldsWithoutValues = this.fields.filter(
      field => typeof originalInput[field.path] === 'undefined'
    );

    const defaultValues = await this._mapToFields(fieldsWithoutValues, field =>
      field.getDefaultValue(args)
    );

    return {
      ...omitBy(defaultValues, path => typeof defaultValues[path] === 'undefined'),
      ...originalInput,
    };
  }

  async _resolveInput(resolvedData, existingItem, context, operation, originalInput) {
    const args = {
      resolvedData,
      existingItem,
      context,
      originalInput,
      actions: mapKeys(this.hooksActions, hook => hook(context)),
      operation,
    };

    // First we run the field type hooks
    // NOTE: resolveInput is run on _every_ field, regardless if it has a value
    // passed in or not
    resolvedData = await this._mapToFields(this.fields, field => field.resolveInput(args));

    // We then filter out the `undefined` results (they should return `null` or
    // a value)
    resolvedData = omitBy(resolvedData, key => typeof resolvedData[key] === 'undefined');

    // Run the schema-level field hooks, passing in the results from the field
    // type hooks
    resolvedData = {
      ...resolvedData,
      ...(await this._mapToFields(
        this.fields.filter(field => field.hooks.resolveInput),
        field => field.hooks.resolveInput({ ...args, resolvedData })
      )),
    };

    // And filter out the `undefined`s again.
    resolvedData = omitBy(resolvedData, key => typeof resolvedData[key] === 'undefined');

    if (this.hooks.resolveInput) {
      // And run any list-level hook
      resolvedData = await this.hooks.resolveInput({ ...args, resolvedData });
      if (typeof resolvedData !== 'object') {
        throw new Error(
          `Expected ${
            this.key
          }.hooks.resolveInput() to return an object, but got a ${typeof resolvedData}: ${resolvedData}`
        );
      }
    }

    // Finally returning the amalgamated result of all the hooks.
    return resolvedData;
  }

  async _validateInput(resolvedData, existingItem, context, operation, originalInput) {
    const args = {
      resolvedData,
      existingItem,
      context,
      originalInput,
      actions: mapKeys(this.hooksActions, hook => hook(context)),
      operation,
    };
    // Check for isRequired
    const fieldValidationErrors = this.fields
      .filter(
        field =>
          field.isRequired &&
          !field.isRelationship &&
          ((operation === 'create' &&
            (resolvedData[field.path] === undefined || resolvedData[field.path] === null)) ||
            (operation === 'update' &&
              Object.prototype.hasOwnProperty.call(resolvedData, field.path) &&
              (resolvedData[field.path] === undefined || resolvedData[field.path] === null)))
      )
      .map(f => ({
        msg: `Required field "${f.path}" is null or undefined.`,
        data: { resolvedData, operation, originalInput },
        internalData: {},
      }));
    if (fieldValidationErrors.length) {
      this._throwValidationFailure(fieldValidationErrors, operation, originalInput);
    }

    const fields = this._fieldsFromObject(resolvedData);
    await this._validateHook(args, fields, operation, 'validateInput');
  }

  async _validateDelete(existingItem, context, operation) {
    const args = {
      existingItem,
      context,
      actions: mapKeys(this.hooksActions, hook => hook(context)),
      operation,
    };
    const fields = this.fields;
    await this._validateHook(args, fields, operation, 'validateDelete');
  }

  async _validateHook(args, fields, operation, hookName) {
    const { originalInput } = args;
    const fieldValidationErrors = [];
    // FIXME: Can we do this in a way where we simply return validation errors instead?
    args.addFieldValidationError = (msg, _data = {}, internalData = {}) =>
      fieldValidationErrors.push({ msg, data: _data, internalData });
    await this._mapToFields(fields, field => field[hookName](args));
    await this._mapToFields(
      fields.filter(field => field.hooks[hookName]),
      field => field.hooks[hookName](args)
    );
    if (fieldValidationErrors.length) {
      this._throwValidationFailure(fieldValidationErrors, operation, originalInput);
    }

    if (this.hooks[hookName]) {
      const listValidationErrors = [];
      await this.hooks[hookName]({
        ...args,
        addValidationError: (msg, _data = {}, internalData = {}) =>
          listValidationErrors.push({ msg, data: _data, internalData }),
      });
      if (listValidationErrors.length) {
        this._throwValidationFailure(listValidationErrors, operation, originalInput);
      }
    }
  }

  async _beforeChange(resolvedData, existingItem, context, operation, originalInput) {
    const args = {
      resolvedData,
      existingItem,
      context,
      originalInput,
      actions: mapKeys(this.hooksActions, hook => hook(context)),
      operation,
    };
    await this._runHook(args, resolvedData, 'beforeChange');
  }

  async _beforeDelete(existingItem, context, operation) {
    const args = {
      existingItem,
      context,
      actions: mapKeys(this.hooksActions, hook => hook(context)),
      operation,
    };
    await this._runHook(args, existingItem, 'beforeDelete');
  }

  async _afterChange(updatedItem, existingItem, context, operation, originalInput) {
    const args = {
      updatedItem,
      originalInput,
      existingItem,
      context,
      actions: mapKeys(this.hooksActions, hook => hook(context)),
      operation,
    };
    await this._runHook(args, updatedItem, 'afterChange');
  }

  async _afterDelete(existingItem, context, operation) {
    const args = {
      existingItem,
      context,
      actions: mapKeys(this.hooksActions, hook => hook(context)),
      operation,
    };
    await this._runHook(args, existingItem, 'afterDelete');
  }

  // Used to apply hooks that only produce side effects
  async _runHook(args, fieldObject, hookName) {
    const fields = this._fieldsFromObject(fieldObject);
    await this._mapToFields(fields, field => field[hookName](args));
    await this._mapToFields(
      fields.filter(field => field.hooks[hookName]),
      field => field.hooks[hookName](args)
    );

    if (this.hooks[hookName]) await this.hooks[hookName](args);
  }

  async _nestedMutation(mutationState, context, mutation) {
    const { Relationship } = require('@k5js/fields');
    // Set up a fresh mutation state if we're the root mutation
    const isRootMutation = !mutationState;
    if (isRootMutation) {
      mutationState = {
        afterChangeStack: [], // post-hook stack
        queues: {}, // backlink queues
        transaction: {}, // transaction
      };
    }

    // Perform the mutation
    const { result, afterHook } = await mutation(mutationState);

    // resolve backlinks
    await Relationship.resolveBacklinks(context, mutationState);

    // Push after-hook onto the stack and resolve all if we're the root.
    const { afterChangeStack } = mutationState;
    afterChangeStack.push(afterHook);
    if (isRootMutation) {
      // TODO: Close transaction

      // Execute post-hook stack
      while (afterChangeStack.length) {
        await afterChangeStack.pop()();
      }
    }

    // Return the result of the mutation
    return result;
  }

  async createMutation(data, context, mutationState) {
    const operation = 'create';
    const gqlName = this.gqlNames.createMutationName;

    this.checkListAccess(context, data, operation, { gqlName });

    const existingItem = undefined;

    const itemsToUpdate = [{ existingItem, data }];

    this.checkFieldAccess(operation, itemsToUpdate, context, { gqlName });

    return await this._createSingle(data, existingItem, context, mutationState);
  }

  async createManyMutation(data, context, mutationState) {
    const operation = 'create';
    const gqlName = this.gqlNames.createManyMutationName;

    this.checkListAccess(context, data, operation, { gqlName });

    const itemsToUpdate = data.map(d => ({ existingItem: undefined, data: d.data }));

    this.checkFieldAccess(operation, itemsToUpdate, context, { gqlName });

    return Promise.all(
      data.map(d => this._createSingle(d.data, undefined, context, mutationState))
    );
  }

  async _createSingle(originalInput, existingItem, context, mutationState) {
    const operation = 'create';
    return await this._nestedMutation(mutationState, context, async mutationState => {
      const defaultedItem = await this._resolveDefaults({ existingItem, context, originalInput });

      // Enable resolveRelationship to perform some action after the item is created by
      // giving them a promise which will eventually resolve with the value of the
      // newly created item.
      const createdPromise = createLazyDeferred();

      let resolvedData = await this._resolveRelationship(
        defaultedItem,
        existingItem,
        context,
        createdPromise.promise,
        mutationState
      );

      resolvedData = await this._resolveInput(
        resolvedData,
        existingItem,
        context,
        operation,
        originalInput
      );

      await this._validateInput(resolvedData, existingItem, context, operation, originalInput);

      await this._beforeChange(resolvedData, existingItem, context, operation, originalInput);

      let newItem;
      try {
        newItem = await this.adapter.create(resolvedData);
        createdPromise.resolve(newItem);
        // Wait until next tick so the promise/micro-task queue can be flushed
        // fully, ensuring the deferred handlers get executed before we move on
        await new Promise(res => process.nextTick(res));
      } catch (error) {
        createdPromise.reject(error);
        // Wait until next tick so the promise/micro-task queue can be flushed
        // fully, ensuring the deferred handlers get executed before we move on
        await new Promise(res => process.nextTick(res));
        // Rethrow the error to ensure it's surfaced to Apollo
        throw error;
      }

      return {
        result: newItem,
        afterHook: () =>
          this._afterChange(newItem, existingItem, context, operation, originalInput),
      };
    });
  }

  async updateMutation(id, data, context, mutationState) {
    const operation = 'update';
    const gqlName = this.gqlNames.updateMutationName;
    const extraData = { itemId: id };

    const access = this.checkListAccess(context, data, operation, { gqlName, ...extraData });

    const existingItem = await this.getAccessControlledItem(id, access, {
      context,
      operation,
      gqlName,
    });

    const itemsToUpdate = [{ existingItem, data }];

    this.checkFieldAccess(operation, itemsToUpdate, context, { gqlName, extraData });

    return await this._updateSingle(id, data, existingItem, context, mutationState);
  }

  async updateManyMutation(data, context, mutationState) {
    const operation = 'update';
    const gqlName = this.gqlNames.updateManyMutationName;
    const ids = data.map(d => d.id);
    const extraData = { itemId: ids };

    const access = this.checkListAccess(context, data, operation, { gqlName, ...extraData });

    const existingItems = await this.getAccessControlledItems(ids, access);

    const itemsToUpdate = zipObj({
      existingItem: existingItems,
      id: ids,
      data: data.map(d => d.data),
    });

    // FIXME: We should do all of these in parallel and return *all* the field access violations
    this.checkFieldAccess(operation, itemsToUpdate, context, { gqlName, extraData });

    return Promise.all(
      itemsToUpdate.map(({ existingItem, id, data }) =>
        this._updateSingle(id, data, existingItem, context, mutationState)
      )
    );
  }

  async _updateSingle(id, data, existingItem, context, mutationState) {
    const operation = 'update';
    return await this._nestedMutation(mutationState, context, async mutationState => {
      let resolvedData = await this._resolveRelationship(
        data,
        existingItem,
        context,
        undefined,
        mutationState
      );

      resolvedData = await this._resolveInput(resolvedData, existingItem, context, operation, data);

      await this._validateInput(resolvedData, existingItem, context, operation, data);

      await this._beforeChange(resolvedData, existingItem, context, operation, data);

      const newItem = await this.adapter.update(id, resolvedData);

      return {
        result: newItem,
        afterHook: () => this._afterChange(newItem, existingItem, context, operation, data),
      };
    });
  }

  async deleteMutation(id, context, mutationState) {
    const operation = 'delete';
    const gqlName = this.gqlNames.deleteMutationName;

    const access = this.checkListAccess(context, undefined, operation, { gqlName, itemId: id });

    const existingItem = await this.getAccessControlledItem(id, access, {
      context,
      operation,
      gqlName,
    });

    return this._deleteSingle(existingItem, context, mutationState);
  }

  async deleteManyMutation(ids, context, mutationState) {
    const operation = 'delete';
    const gqlName = this.gqlNames.deleteManyMutationName;

    const access = this.checkListAccess(context, undefined, operation, { gqlName, itemIds: ids });

    const existingItems = await this.getAccessControlledItems(ids, access);

    return Promise.all(
      existingItems.map(existingItem => this._deleteSingle(existingItem, context, mutationState))
    );
  }

  async _deleteSingle(existingItem, context, mutationState) {
    const operation = 'delete';

    return await this._nestedMutation(mutationState, context, async mutationState => {
      await this._registerBacklinks(existingItem, mutationState);

      await this._validateDelete(existingItem, context, operation);

      await this._beforeDelete(existingItem, context, operation);

      await this.adapter.delete(existingItem.id);

      return {
        result: existingItem,
        afterHook: () => this._afterDelete(existingItem, context, operation),
      };
    });
  }

  getFieldByPath(path) {
    return this.fieldsByPath[path];
  }
  getPrimaryKey() {
    return this.fieldsByPath['id'];
  }
};
