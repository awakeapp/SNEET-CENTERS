import fs from 'fs';
['NEW_SCHEMA_BOYS.csv', 'NEW_SCHEMA_GIRLS.csv'].forEach(f => {
  const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).slice(1);
  let missing = 0;
  lines.forEach(l => {
    // fields: id,center_name,district,taluk_or_city,address,latitude,longitude,contact_person,phone_number,map_link,status
    // index:  0          1        2             3       4        5         6              7            8        9     10
    const parts = l.split(',');
    if (parts.length >= 7 && (!parts[5] || !parts[6])) missing++;
  });
  console.log(`${f}: ${missing} missing coords out of ${lines.length}`);
});
