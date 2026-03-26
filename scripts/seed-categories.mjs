import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jrqjzzeafueibayixklj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpycWp6emVhZnVlaWJheWl4a2xqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDMxMTYzMSwiZXhwIjoyMDg5ODg3NjMxfQ.JDy-3sB3A-N8E8lPrhs-aTD71laM8Da2I-eWwXyJp9I'
);

const propertyId = 'a0000000-0000-0000-0000-000000000001';

// Create categories
const categories = [
  { id: 'cat-hammam', property_id: propertyId, name_fr: 'Hammam', name_en: 'Hammam', display_order: 1 },
  { id: 'cat-massage', property_id: propertyId, name_fr: 'Massages', name_en: 'Massages', display_order: 2 },
  { id: 'cat-pack', property_id: propertyId, name_fr: 'Packs', name_en: 'Packages', display_order: 3 },
  { id: 'cat-visage', property_id: propertyId, name_fr: 'Soins du visage', name_en: 'Facial Care', display_order: 4 },
  { id: 'cat-manucure', property_id: propertyId, name_fr: 'Manucure & Pédicure', name_en: 'Manicure & Pedicure', display_order: 5 },
  { id: 'cat-epilation', property_id: propertyId, name_fr: 'Épilation', name_en: 'Waxing', display_order: 6 },
];

const { error: catError } = await supabase
  .from('service_categories')
  .upsert(categories, { onConflict: 'id' });

if (catError) {
  console.error('Cat error:', catError);
} else {
  console.log('Categories created');
}

// Fetch services
const { data: services } = await supabase
  .from('services')
  .select('id, name_fr')
  .eq('property_id', propertyId);

// Assign categories based on name patterns
for (const svc of services || []) {
  let catId = null;
  const name = svc.name_fr.toLowerCase();
  
  if (name.includes('pack')) {
    catId = 'cat-pack';
  } else if (name.includes('hammam') || name.includes('rituel') || name === 'soins du corps elisa') {
    catId = 'cat-hammam';
  } else if (name.includes('massage') || name.includes('réflexologie')) {
    catId = 'cat-massage';
  } else if (name.includes('visage') || name.includes('facial')) {
    catId = 'cat-visage';
  } else if (name.includes('manucure') || name.includes('pédicure') || name.includes('vernis') || name.includes('dépose')) {
    catId = 'cat-manucure';
  } else if (['sourcils', 'lèvres', 'aisselles', 'demi-bras', 'bras', 'bikini', 'demi-jambes', 'jambes complètes', 'dos'].some(w => name.includes(w))) {
    catId = 'cat-epilation';
  }
  
  if (catId) {
    await supabase.from('services').update({ category_id: catId }).eq('id', svc.id);
    console.log(`  ${svc.name_fr} -> ${catId}`);
  } else {
    console.log(`  [NO MATCH] ${svc.name_fr}`);
  }
}

console.log('Done!');
