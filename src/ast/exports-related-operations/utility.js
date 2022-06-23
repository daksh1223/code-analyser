const {
  getNewImportVariableObject,
  getNewDefaultObject,
} = require("../utility");
const {
  ALL_EXPORTS_IMPORTED,
  INDIVIDUAL_IMPORT,
  EXPORT_SPECIFIER,
  EXPORT_NAMESPACE_SPECIFIER,
  ALL_EXPORTS_AS_OBJECT,
  IDENTIFIER,
  OBJECT_EXPRESSION,
  DEFAULT,
  NORMAL_EXPORT,
  DEFAULT_OBJECT_EXPORT,
} = require("../../utility/constants");

/**
 * Will parse the export statement's specifier and set it as an import of the current file
 * @param {Object} specifier Node in AST that corresponds to export from statement's specifier
 * @param {Object} currentFileMetadata Contains information related to the current file's imports and exports
 * @param {Object} filesMetadata Contains inforamtion related to all files
 */
const setImportedVariablesFromExportFromStatementSpecifier = (
  specifier,
  currentFileMetadata,
  importedFileAddress
) => {
  const exportName = specifier.exported.name;
  let importName = exportName;
  let type = ALL_EXPORTS_IMPORTED;
  if (specifier.local) {
    importName = specifier.local.name;
    type = INDIVIDUAL_IMPORT;
  }
  currentFileMetadata.importedVariablesMetadata[importName] =
    getNewImportVariableObject(
      exportName,
      importName,
      type,
      importedFileAddress
    );
};

/**
 * Will be used to extract information from a provided AST node
 * @param {Object} specifier Provided AST node
 * @returns export type, import and export name of the exported variable
 */
const extractVariableInformationFromSpecifier = (specifier) => {
  let specifierType = INDIVIDUAL_IMPORT;
  let exportName = specifier.exported.name;
  let importName = exportName;
  // "export {...} from ..." type statements
  if (specifier.type === EXPORT_SPECIFIER) {
    specifierType = INDIVIDUAL_IMPORT;
    importName = specifier.local.name;
  }
  // "export * as ... from ..." type statements
  else if (specifier.type === EXPORT_NAMESPACE_SPECIFIER) {
    specifierType = ALL_EXPORTS_AS_OBJECT;
  }
  return { specifierType, exportName, importName };
};

/**
 * Covers various types of export statements
 * Covers both commonJs and ES6 type exports
 * @param {Object} nodeToGetValues AST node to get values from
 * @param {String} type To check whether it is a default export or not
 * @returns Array of key value pairs representing local and exported name
 */
const getValuesFromStatement = (nodeToGetValues, type) => {
  // module.exports = X type statements
  if (nodeToGetValues.type === IDENTIFIER)
    return {
      exportedVariablesArray: [{ [nodeToGetValues.name]: DEFAULT }],
      type: NORMAL_EXPORT,
    };
  // module.exports = {X} type statements
  else if (nodeToGetValues.type === OBJECT_EXPRESSION) {
    const keyValuesPairArray = getValuesFromObject(nodeToGetValues.properties);
    return {
      exportedVariablesArray: keyValuesPairArray,
      type: DEFAULT_OBJECT_EXPORT,
    };
  }
  // export {x as y} type statements
  else if (nodeToGetValues.specifiers && nodeToGetValues.specifiers.length) {
    const keyValuesPairArray = [];
    nodeToGetValues.specifiers.forEach((specifier) => {
      if (specifier.local)
        keyValuesPairArray.push({
          [specifier.local.name]: specifier.exported.name,
        });
      else
        keyValuesPairArray.push({
          [specifier.exported.name]: specifier.exported.name,
        });
    });
    return { exportedVariablesArray: keyValuesPairArray, type: NORMAL_EXPORT };
  } else if (nodeToGetValues.declaration) {
    // export default x type statements
    if (nodeToGetValues.declaration.name)
      return {
        exportedVariablesArray: [
          { [nodeToGetValues.declaration.name]: DEFAULT },
        ],
        type: NORMAL_EXPORT,
      };
    else if (nodeToGetValues.declaration.declarations) {
      // export const x = () => {} type statements
      const keyValuesPairArray = [];
      nodeToGetValues.declaration.declarations.forEach((declaration) => {
        if (declaration.id.name) {
          keyValuesPairArray.push({
            [declaration.id.name]: declaration.id.name,
          });
        }
      });
      return {
        exportedVariablesArray: keyValuesPairArray,
        type: NORMAL_EXPORT,
      };
    } else if (nodeToGetValues.declaration.id) {
      // export function x(){} type statements
      const keyValuesPairArray = [];
      // export default function x(){} type statements
      if (type === DEFAULT) {
        keyValuesPairArray.push({
          [nodeToGetValues.declaration.id.name]: DEFAULT,
        });
      } else
        keyValuesPairArray.push({
          [nodeToGetValues.declaration.id.name]:
            nodeToGetValues.declaration.id.name,
        });
      return {
        exportedVariablesArray: keyValuesPairArray,
        type: NORMAL_EXPORT,
      };
    }
    // export default x  = () => {} type cases
    else if (nodeToGetValues.declaration.left) {
      const keyValuesPairArray = [];
      if (type === DEFAULT) {
        keyValuesPairArray.push({
          [nodeToGetValues.declaration.left.name]: DEFAULT,
        });
      } else
        keyValuesPairArray.push({
          [nodeToGetValues.declaration.left.name]:
            nodeToGetValues.declaration.left.name,
        });
      return {
        exportedVariablesArray: keyValuesPairArray,
        type: NORMAL_EXPORT,
      };
    }
    // export default {...} type cases
    else if (nodeToGetValues.declaration.properties) {
      const keyValuesPairArray = getValuesFromObject(
        nodeToGetValues.declaration.properties
      );
      return {
        exportedVariablesArray: keyValuesPairArray,
        type: DEFAULT_OBJECT_EXPORT,
      };
    }
    // Will cover any other case
    else
      return {
        exportedVariablesArray: [{ [DEFAULT]: DEFAULT }],
        type: NORMAL_EXPORT,
      };
  } else
    return {
      exportedVariablesArray: [{ [DEFAULT]: DEFAULT }],
      type: NORMAL_EXPORT,
    };
};

/**
 * Parses the given array to generate a new key-value pairs array
 * @param {Array} arrayToGetValuesFrom
 * @returns Array containing key-value pairs
 */
const getValuesFromObject = (arrayToGetValuesFrom) => {
  const keyValuesPairArray = [];
  arrayToGetValuesFrom.forEach((property) => {
    // Each individual element inside the {...} is a property
    if (property.key) {
      const keyName = property.key.name
        ? property.key.name
        : property.key.value;
      if (property.value && property.value.name)
        keyValuesPairArray.push({ [property.value.name]: keyName });
      else if (property.value && property.value.id)
        keyValuesPairArray.push({ [property.value.id.name]: keyName });
      else keyValuesPairArray.push({ [keyName]: keyName });
    }
  });
  return keyValuesPairArray;
};

/**
 * Will set the export variables of the current file
 * If an export is also an imported variable, then it will simply refer it
 * @param {Array} exportedVariablesArray Array of parsed exported variables each containing a key value pair
 * @param {Object} currentFileMetadata To check whether a variable was imported or is a local one
 * @param {Object} filesMetadata To get all exported variables of another file
 */
const setExportedVariablesFromArray = (
  { exportedVariablesArray, type },
  currentFileMetadata,
  filesMetadata
) => {
  exportedVariablesArray.forEach((variable) => {
    let exportVariableMetadata;
    try {
      // If it is an imported variable
      if (
        currentFileMetadata.importedVariablesMetadata[Object.keys(variable)[0]]
      ) {
        const importedVariable =
          currentFileMetadata.importedVariablesMetadata[
            Object.keys(variable)[0]
          ];
        exportVariableMetadata = {
          variable,
          importedVariable,
        };
      } else {
        // If it isn't an imported variable
        exportVariableMetadata = {
          variable,
          importedVariable: null,
        };
      }
      if (type === NORMAL_EXPORT) {
        exportVariableMetadata.variableToUpdate =
          currentFileMetadata.exportedVariables;
      } else {
        if (!currentFileMetadata.exportedVariables[DEFAULT]) {
          currentFileMetadata.exportedVariables[DEFAULT] = getNewDefaultObject(
            currentFileMetadata.fileLocation,
            DEFAULT,
            currentFileMetadata.isEntryFile
          );
        }
        exportVariableMetadata.variableToUpdate =
          currentFileMetadata.exportedVariables[DEFAULT];
      }
      setExportVariable(
        exportVariableMetadata,
        currentFileMetadata,
        filesMetadata
      );
    } catch (_) {}
  });
};

/**
 * Will set the current file's exported variable and it's corresponding attributes
 * @param {Object} exportVariableMetadata Contains the local and exported name of the exported variable, information whether the exported variable was first imported
 * @param {Object} currentFileMetadata To check whether a variable was imported or is a local one
 * @param {Object} filesMetadata To get all exported variables of another file
 */
const setExportVariable = (
  { variable, importedVariable, variableToUpdate },
  currentFileMetadata,
  filesMetadata
) => {
  try {
    if (importedVariable) {
      const importedVariableToSet =
        importedVariable.type === ALL_EXPORTS_IMPORTED
          ? filesMetadata.filesMapping[importedVariable.importedFrom]
              .exportedVariables
          : filesMetadata.filesMapping[importedVariable.importedFrom]
              .exportedVariables[importedVariable.name];

      variableToUpdate[Object.values(variable)[0]] = importedVariableToSet;

      variableToUpdate[
        Object.values(variable)[0]
      ].individualFileReferencesMapping[currentFileMetadata.fileLocation] =
        importedVariable.referenceCountObject;

      variableToUpdate[Object.values(variable)[0]].isEntryFileObject |=
        currentFileMetadata.isEntryFile;
    } else {
      variableToUpdate[Object.values(variable)[0]] = getNewDefaultObject(
        currentFileMetadata.fileLocation,
        Object.keys(variable)[0]
      );
    }
  } catch (_) {}
};

module.exports = {
  setImportedVariablesFromExportFromStatementSpecifier,
  extractVariableInformationFromSpecifier,
  getValuesFromStatement,
  setExportedVariablesFromArray,
};
