from pathlib import Path

TARGET = Path('src/app/api/graphql/modules/contacts/index.ts')

if not TARGET.is_file():
    raise SystemExit(f'Could not find {TARGET}. Run this script from your Lakupak project root.')

source = TARGET.read_text(encoding='utf-8')

old_type = '''type SupplierWithRecords = SupplierModel & {
  supplyRecords?: Array<{
    suppliesno: string;
    sku: string;
    product: string;
    totalSupplied: string;
'''
new_type = '''type SupplierWithRecords = SupplierModel & {
  supplyRecords?: Array<{
    suppliesno: string;
    sku: string;
    product: string;
    /** Original supplier-entered package quantity, e.g. "1" for one Carton. */
    receivedQuantity: string;
    /** Original supplier-selected stock level; inventory quantity remains totalSupplied in Pieces. */
    receivedUnit: string;
    totalSupplied: string;
'''

old_mapper = '''            sku: row.sku,
            product: row.product,
            totalSupplied: row.totalSupplied,
            totalValue: row.totalValue,
'''
new_mapper = '''            sku: row.sku,
            product: row.product,
            // Preserve the supplier's original input separately from canonical Pieces.
            receivedQuantity: row.receivedQuantity,
            receivedUnit: row.receivedUnit,
            totalSupplied: row.totalSupplied,
            totalValue: row.totalValue,
'''

# Fail safely rather than overwriting or partially patching an unexpected source version.
if source.count(new_type) == 1 and source.count(new_mapper) == 1:
    print('Already patched: receivedQuantity and receivedUnit are returned by mapSupplier.')
    raise SystemExit(0)

if source.count(old_type) != 1:
    raise SystemExit('Expected SupplierWithRecords type block was not found exactly once. No files changed.')
if source.count(old_mapper) != 1:
    raise SystemExit('Expected mapSupplier projection was not found exactly once. No files changed.')

updated = source.replace(old_type, new_type, 1).replace(old_mapper, new_mapper, 1)
TARGET.write_text(updated, encoding='utf-8')
print('Patched src/app/api/graphql/modules/contacts/index.ts')
print('Added receivedQuantity and receivedUnit to the SupplierWithRecords type and mapSupplier response.')
print('Buyer mappings and all other contacts/index.ts code were left unchanged.')
