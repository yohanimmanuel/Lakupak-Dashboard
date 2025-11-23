const { execSync } = require('child_process');

const migrations = [
  '20251006155554_baseline_sql_database_new',
  '20251007014405_add_offer_fields',
  '20251007075244_add_offer_fields',
  '20251008020107_update_offer_fields',
  '20251008023247_change_minordervalue_to_string',
  '20251008024049_fix_minordervalue_to_float',
  '20251008101310_add_days_field',
  '20251008163703_change_string_type',
  '20251010111450_add_original_selling_price',
  '20251011025528_add_applied_discount_types_field',
  '20251011032642_remove_applied_discount_types_field',
  '20251012015139_add_offer_snapshots_to_order',
  '20251014034432_add_offer_usage_tracking',
  '20251014051052_add_discounttype_to_usage_tracking',
  '20251014133902_remove_buyerid_from_offer_usage_tracking',
  '20251014155931_add_discount_amount_field',
  '20251015151526_remove_percustomerlimit_field',
  '20251023073849_add_product_variant_field',
  '20251023081841_remove_duplicate_product_fields',
  '20251023083346_add_product_variant_field',
  '20251024130108_add_moq_field_to_productvariant',
  '20251025041157_remove_maxusage',
  '20251025085323_redefine_product_module',
  '20251025092441_add_package_name',
  '20251025124513_add_moqsnapshot_to_orderitem',
  '20251025135304_add_variant_name_snapshot',
  '20251025140342_add_variantid',
  '20251027154242_remove_packageinfo_model',
  '20251028143835_add_variant_definitions_and_options',
  '20251028150827_add_variantoption_only',
  '20251107162546_add_order_fields',
  '20251107163311_add_shippingmethod_to_orderfiedl'
];

console.log('Marking all migrations as applied...\n');

for (const migration of migrations) {
  try {
    console.log(`Marking ${migration} as applied...`);
    execSync(`npx prisma migrate resolve --applied ${migration}`, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error marking ${migration}:`, error.message);
  }
}

console.log('\n✓ All migrations marked as applied!');
console.log('Now you can run: npx prisma migrate dev --name your_new_migration');
