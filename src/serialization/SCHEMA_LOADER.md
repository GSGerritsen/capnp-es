# SchemaLoader - Dynamic Schema Loading

The `SchemaLoader` class allows you to load Cap'n Proto schemas dynamically from raw `Node` objects and decode messages without pre-compiled TypeScript classes.

This is equivalent to pycapnp's `SchemaLoader` functionality.

## Quick Start

```typescript
import { Message, SchemaLoader, Node } from "capnp-es";

// 1. Create a loader
const loader = new SchemaLoader();

// 2. Load schema nodes
const schemaMessage = new Message(schemaBytes);
const node = schemaMessage.getRoot(Node);
loader.loadDynamic(node);

// 3. Get the schema by name
const schema = loader.getByName("MyMessage");

// 4. Decode a message
const message = new Message(messageBytes);
const decoded = message.getRoot(schema.structCtor);

// 5. Access fields
console.log(decoded.fieldName);
// Or convert to plain object:
const obj = loader.toObject(decoded, schema);
console.log(obj);
```

## Comparison with pycapnp

### pycapnp (Python)
```python
import capnp

# Create loader
schema_loader = capnp.SchemaLoader()

# Load nodes
for node in nodes:
    schema_loader.load_dynamic(node)

# Get schema
schema = schema_loader.get(schema_id).as_struct()

# Decode message
struct_module = capnp.lib.capnp._StructModule(schema, "MessageName")
decoded = struct_module.from_segments([message_raw])

# Access fields
print(decoded.field_name)
```

### capnp-es (TypeScript)
```typescript
import { SchemaLoader, Message, Node } from "capnp-es";

// Create loader
const loader = new SchemaLoader();

// Load nodes
for (const node of nodes) {
    loader.loadDynamic(node);
}

// Get schema
const schema = loader.get(schemaId); // or loader.getByName("MessageName")

// Decode message
const message = new Message(messageBytes);
const decoded = message.getRoot(schema.structCtor);

// Access fields
console.log(decoded.fieldName);
```

## API Reference

### `SchemaLoader`

#### `loadDynamic(node: Node): LoadedSchema`
Load a schema node dynamically.

```typescript
const node = message.getRoot(Node);
const schema = loader.loadDynamic(node);
```

#### `get(id: bigint): LoadedSchema`
Get a loaded schema by its ID.

```typescript
const schema = loader.get(BigInt("0x1234567890abcdef"));
```

#### `getByName(name: string): LoadedSchema | undefined`
Get a loaded schema by its display name.

```typescript
const schema = loader.getByName("JointState");
if (schema) {
    // Use schema
}
```

#### `toObject(struct: Struct, schema: LoadedSchema): Record<string, any>`
Convert a struct to a plain JavaScript object.

```typescript
const decoded = message.getRoot(schema.structCtor);
const obj = loader.toObject(decoded, schema);
console.log(JSON.stringify(obj, null, 2));
```

### `LoadedSchema`

The result of loading a schema:

```typescript
interface LoadedSchema {
    id: bigint;              // Schema ID
    displayName: string;     // Simple name (e.g., "MyMessage")
    size: ObjectSize;        // Struct size information
    structCtor: StructCtor;  // Constructor for decoding messages
}
```

## Use Cases

### 1. MCAP File Decoding

MCAP files contain schemas as binary data. Use SchemaLoader to decode them:

```typescript
// From MCAP schema record
const schemaBytes = mcapSchema.data;
const schemaMessage = new Message(schemaBytes);
const node = schemaMessage.getRoot(Node);

const loader = new SchemaLoader();
loader.loadDynamic(node);

// Decode MCAP message
const messageBytes = mcapMessage.data;
const schema = loader.getByName(mcapChannel.schemaName);
const message = new Message(messageBytes);
const decoded = message.getRoot(schema.structCtor);
```

### 2. Foxglove WebSocket

Foxglove WebSocket sends schemas dynamically:

```typescript
// On schema message from websocket
const schemaData = websocketMessage.schema;
const loader = new SchemaLoader();

// Parse and load nodes
const schemaMessage = new Message(schemaData);
// ... parse nodes and load with loader.loadDynamic()

// On data message
const schema = loader.getByName(channelName);
const message = new Message(dataBytes);
const decoded = message.getRoot(schema.structCtor);
```

### 3. ROS 2 / DDS Messages

ROS 2 messages use Cap'n Proto schemas:

```typescript
function decodeROS2Message(
    schemaData: Uint8Array,
    messageData: Uint8Array,
    messageType: string  // e.g., "sensor_msgs/JointState"
) {
    const loader = new SchemaLoader();

    // Load schema
    const schemaMessage = new Message(schemaData);
    const node = schemaMessage.getRoot(Node);
    loader.loadDynamic(node);

    // Decode message
    const schema = loader.getByName(messageType);
    const message = new Message(messageData);
    const decoded = message.getRoot(schema.structCtor);

    return loader.toObject(decoded, schema);
}
```

## Limitations

Current limitations (may be addressed in future versions):

1. **Nested structs**: Field accessors return pointers for nested structs, not fully decoded objects
2. **Lists**: List fields return List objects, not plain arrays
3. **Unions**: Union handling is basic - use the `_is` prefixed properties to check union state
4. **Enums**: Enum values are returned as numbers, not enum names

For complex nested structures, use `toObject()` to get a plain JavaScript representation.

## Examples

See the example files for complete working examples:
- `example-decode-simple.ts` - Basic usage patterns
- `example-schema-loader.ts` - Advanced usage with batch decoding

## Comparison Table

| Feature | pycapnp | capnp-es SchemaLoader |
|---------|---------|----------------------|
| Load from Node | `load_dynamic(node)` | `loadDynamic(node)` |
| Get by ID | `get(id)` | `get(BigInt(id))` |
| Get by name | N/A (manual tracking) | `getByName(name)` |
| Decode message | `from_segments([bytes])` | `message.getRoot(schema.structCtor)` |
| Field access | `decoded.field_name` | `decoded.fieldName` |
| To dict/object | `capnp_value_to_dict(decoded)` | `loader.toObject(decoded, schema)` |

## TypeScript Support

SchemaLoader is fully typed, but field access on dynamic structs requires casting:

```typescript
const decoded = message.getRoot(schema.structCtor);

// Option 1: Cast to any for dynamic access
const name = (decoded as any).name;

// Option 2: Convert to object
const obj = loader.toObject(decoded, schema);
const name = obj.name;
```

For better type safety, generate TypeScript classes from your `.capnp` files using `capnp-es` compiler.
