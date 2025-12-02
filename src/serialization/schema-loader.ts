// SchemaLoader - Dynamically load Cap'n Proto schemas from Node definitions

import { ObjectSize } from "./object-size";
import { Struct, StructCtor } from "./pointers/struct";
import { Segment } from "./segment";
import { Message } from "./message";
import * as utils from "./pointers/utils";
import { Node, Field, Type } from "../capnp/schema";

/**
 * Information about a loaded schema
 */
export interface LoadedSchema {
  id: bigint;
  displayName: string;
  size: ObjectSize;
  structCtor: StructCtor<any>;
}

/**
 * Information about a field in a schema
 */
interface FieldInfo {
  name: string;
  offset: number;
  type: string;
  isPointer: boolean;
  isPrimitive: boolean;
  isText: boolean;
  isData: boolean;
  isList: boolean;
  isStruct: boolean;
  structTypeId?: bigint;
  listElementType?: string;
}

/**
 * SchemaLoader allows loading Cap'n Proto schemas dynamically from Node objects
 * and creating struct constructors that can be used to decode messages.
 *
 * This is similar to pycapnp's SchemaLoader.
 *
 * @example
 * ```typescript
 * const loader = new SchemaLoader();
 *
 * // Load schema nodes
 * for (const node of schemaNodes) {
 *   loader.loadDynamic(node);
 * }
 *
 * // Get a schema and use it to decode a message
 * const schema = loader.get(schemaId);
 * const message = new Message(messageBytes);
 * const decoded = message.getRoot(schema.structCtor);
 * ```
 */
export class SchemaLoader {
  private schemas: Map<string, LoadedSchema> = new Map();

  /**
   * Load a schema node dynamically.
   *
   * @param node The Node from schema.capnp containing schema information
   * @returns The loaded schema information
   */
  loadDynamic(node: Node): LoadedSchema {
    const id = node.id;
    const displayName = this.extractDisplayName(node.displayName);

    // Check if it's a struct node
    if (!node._isStruct) {
      throw new Error(`Node ${displayName} (${id}) is not a struct`);
    }

    const structInfo = node.struct;

    // Extract size information
    const size = new ObjectSize(
      structInfo.dataWordCount * 8, // Convert words to bytes
      structInfo.pointerCount
    );

    // Parse fields
    const fields = this.parseFields(structInfo.fields);

    // Create dynamic struct constructor
    const structCtor = this.createDynamicStruct(
      id.toString(16),
      displayName,
      size,
      fields
    );

    const schema: LoadedSchema = {
      id,
      displayName,
      size,
      structCtor,
    };

    // Store by ID (as string for Map key)
    this.schemas.set(id.toString(), schema);

    return schema;
  }

  /**
   * Get a loaded schema by its ID.
   *
   * @param id The schema ID (as bigint)
   * @returns The loaded schema information
   * @throws Error if the schema is not found
   */
  get(id: bigint): LoadedSchema {
    const schema = this.schemas.get(id.toString());
    if (!schema) {
      throw new Error(`Schema with ID ${id} not found. Did you call loadDynamic()?`);
    }
    return schema;
  }

  /**
   * Get a loaded schema by its display name.
   *
   * @param name The schema display name
   * @returns The loaded schema information or undefined if not found
   */
  getByName(name: string): LoadedSchema | undefined {
    for (const schema of this.schemas.values()) {
      if (schema.displayName === name) {
        return schema;
      }
    }
    return undefined;
  }

  /**
   * Extract the simple name from a fully qualified display name.
   * e.g., "foo.capnp:MyStruct" -> "MyStruct"
   */
  private extractDisplayName(fullName: string): string {
    const parts = fullName.split(":");
    return parts[parts.length - 1] || fullName;
  }

  /**
   * Parse field information from a Field list
   */
  private parseFields(fieldsList: any): FieldInfo[] {
    const fields: FieldInfo[] = [];

    for (let i = 0; i < fieldsList.length; i++) {
      const field = fieldsList.get(i);

      // Skip non-slot fields (groups, etc.)
      if (!field._isSlot) {
        continue;
      }

      const slot = field.slot;
      const fieldType = slot.type;
      const typeWhich = fieldType.which();

      const fieldInfo: FieldInfo = {
        name: field.name,
        offset: slot.offset,
        type: this.typeToString(typeWhich),
        isPointer: this.isPointerType(typeWhich),
        isPrimitive: this.isPrimitiveType(typeWhich),
        isText: typeWhich === Type.TEXT,
        isData: typeWhich === Type.DATA,
        isList: typeWhich === Type.LIST,
        isStruct: typeWhich === Type.STRUCT,
      };

      // Get struct type ID if it's a struct
      if (fieldInfo.isStruct) {
        fieldInfo.structTypeId = fieldType.struct.typeId;
      }

      // Get list element type if it's a list
      if (fieldInfo.isList) {
        const elementType = fieldType.list.elementType;
        fieldInfo.listElementType = this.typeToString(elementType.which());
      }

      fields.push(fieldInfo);
    }

    return fields;
  }

  /**
   * Check if a type is a pointer type
   */
  private isPointerType(typeWhich: number): boolean {
    return typeWhich === Type.TEXT ||
           typeWhich === Type.DATA ||
           typeWhich === Type.LIST ||
           typeWhich === Type.STRUCT ||
           typeWhich === Type.ANY_POINTER;
  }

  /**
   * Check if a type is a primitive type
   */
  private isPrimitiveType(typeWhich: number): boolean {
    return typeWhich === Type.BOOL ||
           typeWhich === Type.INT8 ||
           typeWhich === Type.INT16 ||
           typeWhich === Type.INT32 ||
           typeWhich === Type.INT64 ||
           typeWhich === Type.UINT8 ||
           typeWhich === Type.UINT16 ||
           typeWhich === Type.UINT32 ||
           typeWhich === Type.UINT64 ||
           typeWhich === Type.FLOAT32 ||
           typeWhich === Type.FLOAT64;
  }

  /**
   * Convert a type enum to a string name
   */
  private typeToString(typeWhich: number): string {
    switch (typeWhich) {
      case Type.VOID: return "void";
      case Type.BOOL: return "bool";
      case Type.INT8: return "int8";
      case Type.INT16: return "int16";
      case Type.INT32: return "int32";
      case Type.INT64: return "int64";
      case Type.UINT8: return "uint8";
      case Type.UINT16: return "uint16";
      case Type.UINT32: return "uint32";
      case Type.UINT64: return "uint64";
      case Type.FLOAT32: return "float32";
      case Type.FLOAT64: return "float64";
      case Type.TEXT: return "text";
      case Type.DATA: return "data";
      case Type.LIST: return "list";
      case Type.STRUCT: return "struct";
      case Type.ENUM: return "enum";
      case Type.INTERFACE: return "interface";
      case Type.ANY_POINTER: return "anyPointer";
      default: return "unknown";
    }
  }

  /**
   * Create a dynamic struct constructor from schema information
   */
  private createDynamicStruct(
    id: string,
    displayName: string,
    size: ObjectSize,
    fields: FieldInfo[]
  ): StructCtor<any> {
    // Create a dynamic class that extends Struct
    const DynamicStruct = class extends Struct {
      static readonly _capnp = {
        displayName,
        id,
        size,
      };

      toString(): string {
        return `${displayName}_${super.toString()}`;
      }
    };

    // Add getters and setters for each field
    for (const field of fields) {
      this.addFieldAccessors(DynamicStruct.prototype, field);
    }

    return DynamicStruct as StructCtor<any>;
  }

  /**
   * Add getter and setter for a field to the prototype
   */
  private addFieldAccessors(prototype: any, field: FieldInfo): void {
    const descriptor: PropertyDescriptor = {};

    // Create getter
    if (field.isPrimitive) {
      descriptor.get = this.createPrimitiveGetter(field);
      descriptor.set = this.createPrimitiveSetter(field);
    } else if (field.isText) {
      descriptor.get = function(this: Struct) {
        return utils.getText(field.offset, this);
      };
      descriptor.set = function(this: Struct, value: string) {
        utils.setText(field.offset, value, this);
      };
    } else if (field.isData) {
      descriptor.get = function(this: Struct) {
        return utils.getData(field.offset, this);
      };
    } else if (field.isList) {
      descriptor.get = function(this: Struct) {
        return utils.getPointer(field.offset, this);
      };
    } else if (field.isStruct) {
      descriptor.get = function(this: Struct) {
        return utils.getPointer(field.offset, this);
      };
    } else {
      // Fallback: just get the pointer
      descriptor.get = function(this: Struct) {
        return utils.getPointer(field.offset, this);
      };
    }

    descriptor.enumerable = true;
    descriptor.configurable = true;

    Object.defineProperty(prototype, field.name, descriptor);
  }

  /**
   * Create a getter function for a primitive field
   */
  private createPrimitiveGetter(field: FieldInfo): (this: Struct) => any {
    const byteOffset = this.calculateByteOffset(field);

    switch (field.type) {
      case "bool":
        return function(this: Struct) {
          return utils.getBit(field.offset, this);
        };
      case "int8":
        return function(this: Struct) {
          return utils.getInt8(byteOffset, this);
        };
      case "int16":
        return function(this: Struct) {
          return utils.getInt16(byteOffset, this);
        };
      case "int32":
        return function(this: Struct) {
          return utils.getInt32(byteOffset, this);
        };
      case "int64":
        return function(this: Struct) {
          return utils.getInt64(byteOffset, this);
        };
      case "uint8":
        return function(this: Struct) {
          return utils.getUint8(byteOffset, this);
        };
      case "uint16":
        return function(this: Struct) {
          return utils.getUint16(byteOffset, this);
        };
      case "uint32":
        return function(this: Struct) {
          return utils.getUint32(byteOffset, this);
        };
      case "uint64":
        return function(this: Struct) {
          return utils.getUint64(byteOffset, this);
        };
      case "float32":
        return function(this: Struct) {
          return utils.getFloat32(byteOffset, this);
        };
      case "float64":
        return function(this: Struct) {
          return utils.getFloat64(byteOffset, this);
        };
      default:
        return function(this: Struct) {
          return undefined;
        };
    }
  }

  /**
   * Create a setter function for a primitive field
   */
  private createPrimitiveSetter(field: FieldInfo): (this: Struct, value: any) => void {
    const byteOffset = this.calculateByteOffset(field);

    switch (field.type) {
      case "bool":
        return function(this: Struct, value: boolean) {
          utils.setBit(field.offset, value, this);
        };
      case "int8":
        return function(this: Struct, value: number) {
          utils.setInt8(byteOffset, value, this);
        };
      case "int16":
        return function(this: Struct, value: number) {
          utils.setInt16(byteOffset, value, this);
        };
      case "int32":
        return function(this: Struct, value: number) {
          utils.setInt32(byteOffset, value, this);
        };
      case "int64":
        return function(this: Struct, value: bigint) {
          utils.setInt64(byteOffset, value, this);
        };
      case "uint8":
        return function(this: Struct, value: number) {
          utils.setUint8(byteOffset, value, this);
        };
      case "uint16":
        return function(this: Struct, value: number) {
          utils.setUint16(byteOffset, value, this);
        };
      case "uint32":
        return function(this: Struct, value: number) {
          utils.setUint32(byteOffset, value, this);
        };
      case "uint64":
        return function(this: Struct, value: bigint) {
          utils.setUint64(byteOffset, value, this);
        };
      case "float32":
        return function(this: Struct, value: number) {
          utils.setFloat32(byteOffset, value, this);
        };
      case "float64":
        return function(this: Struct, value: number) {
          utils.setFloat64(byteOffset, value, this);
        };
      default:
        return function(this: Struct, value: any) {
          // No-op
        };
    }
  }

  /**
   * Calculate byte offset from slot offset based on type
   */
  private calculateByteOffset(field: FieldInfo): number {
    // For bool, the offset is in bits
    if (field.type === "bool") {
      return Math.floor(field.offset / 8);
    }

    // For other types, multiply offset by type size
    const typeSizes: Record<string, number> = {
      "int8": 1, "uint8": 1,
      "int16": 2, "uint16": 2,
      "int32": 4, "uint32": 4,
      "int64": 8, "uint64": 8,
      "float32": 4, "float64": 8,
    };

    const typeSize = typeSizes[field.type] || 8;
    return field.offset * typeSize;
  }

  /**
   * Convert a struct instance to a plain JavaScript object.
   * Useful for debugging and JSON serialization.
   *
   * @param struct The struct instance to convert
   * @param schema The schema for the struct
   * @returns A plain JavaScript object
   */
  toObject(struct: Struct, schema: LoadedSchema): Record<string, any> {
    const obj: Record<string, any> = {};

    // Get all enumerable properties (our field getters)
    for (const key of Object.keys(Object.getPrototypeOf(struct))) {
      try {
        const value = (struct as any)[key];

        // Skip if it's a function or undefined
        if (typeof value === "function" || value === undefined) {
          continue;
        }

        obj[key] = value;
      } catch (e) {
        // Skip fields that throw errors
        obj[key] = null;
      }
    }

    return obj;
  }
}
