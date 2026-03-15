/**
 * Generates Strapi 5 schema.json files from Strapi 3 model definitions.
 *
 * Input:  parsed Strapi 3 *.settings.json models + field-type-map.json
 * Output: Strapi 5 schema objects + boilerplate file contents
 */

const CONTENT_TYPE_DESCRIPTIONS = {
  article: 'Research articles with markdown body, images, and media attachments',
  dataset: 'Downloadable datasets with metadata, variables, and file attachments',
  app: 'Dashboard apps with image, description, and links to articles and datasets',
};

/**
 * Build a relation graph across all models so we know which side is dominant.
 * Returns a Map keyed by "contentType.fieldName" → { target, via, dominant }
 */
function buildRelationGraph(models) {
  const graph = new Map();

  for (const [ctName, model] of Object.entries(models)) {
    for (const [fieldName, def] of Object.entries(model.attributes || {})) {
      // Skip upload plugin refs — those become media fields, not relations
      if (def.plugin === 'upload') continue;

      const target = def.collection || def.model;
      if (!target) continue;

      graph.set(`${ctName}.${fieldName}`, {
        target,
        via: def.via || null,
        dominant: def.dominant === true,
        isCollection: !!def.collection,
      });
    }
  }

  return graph;
}

/**
 * Convert a single Strapi 3 attribute to its Strapi 5 equivalent.
 */
function convertAttribute(ctName, fieldName, def, fieldTypeMap, relationGraph) {
  // Upload plugin → media field
  if (def.plugin === 'upload') {
    const allowedTypes = fieldTypeMap.uploadPluginAllowedTypes?.[fieldName] || ['files', 'images'];
    return {
      type: 'media',
      allowedTypes,
      multiple: !!def.collection, // "model" = single, "collection" = multiple
    };
  }

  // Relation to another content type
  if (def.collection || (def.model && !def.type)) {
    const target = def.collection || def.model;
    const relationType = def.collection ? 'manyToMany' : 'manyToOne';
    const targetApi = `api::${target}.${target}`;

    const attr = {
      type: 'relation',
      relation: relationType,
      target: targetApi,
    };

    if (def.via) {
      if (def.dominant) {
        attr.inversedBy = def.via;
      } else {
        // Check if the other side is dominant
        const otherKey = `${target}.${def.via}`;
        const otherSide = relationGraph.get(otherKey);
        if (otherSide?.dominant) {
          attr.mappedBy = def.via;
        } else {
          // Neither side explicitly dominant — treat this side as mappedBy
          attr.mappedBy = def.via;
        }
      }
    }

    return attr;
  }

  // Check for field-level override (e.g., article.splash: string → media)
  const overrideKey = `${ctName}.${fieldName}`;
  if (fieldTypeMap.overrides?.[overrideKey]) {
    return { ...fieldTypeMap.overrides[overrideKey].to };
  }

  // Standard typed field
  if (def.type) {
    const mappedType = fieldTypeMap.directMappings?.[def.type] || def.type;
    const attr = { type: mappedType };

    // Preserve constraints
    if (def.required) attr.required = true;
    if (def.unique) attr.unique = true;
    if (def.default !== undefined) attr.default = def.default;
    if (def.minLength !== undefined) attr.minLength = def.minLength;
    if (def.maxLength !== undefined) attr.maxLength = def.maxLength;
    if (def.min !== undefined) attr.min = def.min;
    if (def.max !== undefined) attr.max = def.max;
    if (def.enum) attr.enum = def.enum;
    if (def.targetField) attr.targetField = def.targetField;

    return attr;
  }

  // Unknown field shape — pass through as-is with a warning
  console.warn(`  WARNING: Unknown attribute shape for ${ctName}.${fieldName}:`, def);
  return def;
}

/**
 * Generate a complete Strapi 5 schema.json for one content type.
 */
function generateSchema(ctName, model, fieldTypeMap, relationGraph) {
  const pluralName = ctName + 's';
  const displayName = ctName.charAt(0).toUpperCase() + ctName.slice(1);

  const schema = {
    kind: 'collectionType',
    collectionName: pluralName,
    info: {
      singularName: ctName,
      pluralName,
      displayName,
      description: CONTENT_TYPE_DESCRIPTIONS[ctName] || '',
    },
    options: {
      draftAndPublish: false,
    },
    attributes: {},
  };

  // legacyId first
  schema.attributes.legacyId = {
    type: 'string',
    unique: true,
  };

  // Separate scalar/media fields from relations for ordering
  const scalarAttrs = {};
  const relationAttrs = {};

  for (const [fieldName, def] of Object.entries(model.attributes || {})) {
    const converted = convertAttribute(ctName, fieldName, def, fieldTypeMap, relationGraph);

    if (converted.type === 'relation') {
      relationAttrs[fieldName] = converted;
    } else {
      scalarAttrs[fieldName] = converted;
    }
  }

  // Scalars first, then relations
  Object.assign(schema.attributes, scalarAttrs, relationAttrs);

  return schema;
}

/**
 * Generate boilerplate route/controller/service files for a content type.
 */
function generateBoilerplate(ctName) {
  const uid = `api::${ctName}.${ctName}`;
  return {
    route: `import { createCoreRouter } from '@strapi/strapi/factories';\nexport default createCoreRouter('${uid}');\n`,
    controller: `import { createCoreController } from '@strapi/strapi/factories';\nexport default createCoreController('${uid}');\n`,
    service: `import { createCoreService } from '@strapi/strapi/factories';\nexport default createCoreService('${uid}');\n`,
  };
}

/**
 * Build a field map entry for one content type (for config/field-map.json).
 */
function buildFieldMapEntry(ctName, model, schema, fieldTypeMap) {
  const entry = {};
  for (const [fieldName, def] of Object.entries(model.attributes || {})) {
    const strapi3Type = def.type || (def.plugin === 'upload' ? 'upload-plugin' : 'relation');
    const strapi5Attr = schema.attributes[fieldName];
    const strapi5Type = strapi5Attr?.type || 'unknown';
    const overrideKey = `${ctName}.${fieldName}`;
    const overridden = !!fieldTypeMap.overrides?.[overrideKey];

    entry[fieldName] = {
      strapi3Type,
      strapi5Type,
      overridden,
    };
  }
  // Include the added legacyId
  entry.legacyId = {
    strapi3Type: null,
    strapi5Type: 'string',
    overridden: false,
    added: true,
  };
  return entry;
}

/**
 * Main entry point. Generates all Strapi 5 schemas from Strapi 3 models.
 *
 * @param {Object} strapi3Models - keyed by content type name, values are parsed .settings.json
 * @param {Object} fieldTypeMap  - parsed field-type-map.json
 * @returns {Object} keyed by content type name → { schema, boilerplate, fieldMap }
 */
export function generateStrapi5Schemas(strapi3Models, fieldTypeMap) {
  const relationGraph = buildRelationGraph(strapi3Models);
  const result = {};

  for (const [ctName, model] of Object.entries(strapi3Models)) {
    const schema = generateSchema(ctName, model, fieldTypeMap, relationGraph);
    const boilerplate = generateBoilerplate(ctName);
    const fieldMap = buildFieldMapEntry(ctName, model, schema, fieldTypeMap);

    result[ctName] = { schema, boilerplate, fieldMap };
  }

  return result;
}
