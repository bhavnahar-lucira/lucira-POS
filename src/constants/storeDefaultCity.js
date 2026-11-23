// Default city for new customers, by store company_code, where the store's area is a city in OrnaVerse's
// list but its company record only says the wider city (e.g. Mumbai). Stores not listed use their record's city.
const STORE_DEFAULT_CITY = {
  FCS: 'Chembur',
  CS1: 'Chembur',
  BO1: 'Borivali',
};

export default STORE_DEFAULT_CITY;
