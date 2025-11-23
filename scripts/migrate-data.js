const { Pool } = require('pg');
const fs = require('fs');

// Old database connection (AWS RDS)
const oldDb = new Pool({
  host: 'lakulaku-db.cbsyg280cty4.ap-southeast-1.rds.amazonaws.com',
  port: 5432,
  database: 'lakulakudb',
  user: 'lakupostgres',
  password: 'Tshirtxm1gos.',
  ssl: {
    rejectUnauthorized: false
  }
});

function escapeValue(value, columnName, tableName) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  
  // JSON columns that need JSON formatting
  const jsonColumns = {
    'ProductVariant': ['options'],
    'VariantOption': ['attributes'],
    'UserActivity': ['productData', 'metadata']
  };
  
  // PostgreSQL array columns (not JSON)
  const arrayColumns = {
    'Offer': ['type'],
    'TimeSlot': ['days']
  };
  
  const isJsonColumn = jsonColumns[tableName] && jsonColumns[tableName].includes(columnName);
  const isArrayColumn = arrayColumns[tableName] && arrayColumns[tableName].includes(columnName);
  
  if (Array.isArray(value)) {
    if (isJsonColumn) {
      // JSON array format: '["value1","value2"]'
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    } else {
      // PostgreSQL array format: '{value1,value2,value3}'
      const escapedArray = value.map(item => {
        const str = String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "''");
        return `"${str}"`;
      }).join(',');
      return `'{${escapedArray}}'`;
    }
  }
  
  if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
    // Object - format as JSON string
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  // String - escape single quotes
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function exportTable(tableName) {
  console.log(`Exporting ${tableName}...`);
  
  try {
    const result = await oldDb.query(`SELECT * FROM "${tableName}"`);
    const rows = result.rows;
    
    if (rows.length === 0) {
      console.log(`  No data in ${tableName}`);
      return '';
    }
    
    console.log(`  Found ${rows.length} rows`);
    
    const columns = Object.keys(rows[0]);
    const sqlStatements = [];
    
    for (const row of rows) {
      const values = columns.map(col => escapeValue(row[col], col, tableName));
      const sql = `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});`;
      sqlStatements.push(sql);
    }
    
    return sqlStatements.join('\n') + '\n';
  } catch (error) {
    console.error(`  Error exporting ${tableName}:`, error.message);
    return '';
  }
}

async function main() {
  console.log('Generating SQL migration file...\n');
  
  // Tables in migration order (parent tables first)
  const tables = [
    'MarketplaceUser',
    'Company',  // Must come before User (User references Company)
    'User',
    'Address',
    'Buyer',
    'Supplier',
    'Product',
    'ProductVariant',
    'VariantOption',
    'Order',
    'OrderItem',
    'Account',
    'Session',
    'OtpCode',
    'UserActivity',
    'Offer',
    'OfferDiscountType',
    'OfferProduct',
    'DateRange',
    'TimeSlot',
    'OfferUsageTracking',
    'VerificationToken'
  ];
  
  let sqlContent = '-- Data migration from AWS RDS to Supabase\n';
  sqlContent += '-- Generated automatically\n\n';
  
  for (const table of tables) {
    const tableSQL = await exportTable(table);
    sqlContent += `-- ${table}\n`;
    sqlContent += tableSQL + '\n';
  }
  
  // Write to file
  fs.writeFileSync('lakulaku_data_backup.sql', sqlContent);
  console.log('\n✓ SQL file created: lakulaku_data_backup.sql');
  console.log('Now import this file into Supabase SQL Editor!');
  
  await oldDb.end();
}

main().catch(console.error);

