// ISO 3166-1 alpha-3 → alpha-2 mapping
const MAP = {
  AFG:'AF',AGO:'AO',ALB:'AL',AND:'AD',ARE:'AE',ARG:'AR',ARM:'AM',ATG:'AG',
  AUS:'AU',AUT:'AT',AZE:'AZ',BDI:'BI',BEL:'BE',BEN:'BJ',BFA:'BF',BGD:'BD',
  BGR:'BG',BHR:'BH',BHS:'BS',BIH:'BA',BLR:'BY',BLZ:'BZ',BOL:'BO',BRA:'BR',
  BRB:'BB',BRN:'BN',BTN:'BT',BWA:'BW',CAF:'CF',CAN:'CA',CHE:'CH',CHL:'CL',
  CHN:'CN',CIV:'CI',CMR:'CM',COD:'CD',COG:'CG',COL:'CO',COM:'KM',CPV:'CV',
  CRI:'CR',CUB:'CU',CYP:'CY',CZE:'CZ',DEU:'DE',DJI:'DJ',DMA:'DM',DNK:'DK',
  DOM:'DO',DZA:'DZ',ECU:'EC',EGY:'EG',ERI:'ER',ESP:'ES',EST:'EE',ETH:'ET',
  FIN:'FI',FJI:'FJ',FRA:'FR',FSM:'FM',GAB:'GA',GBR:'GB',GEO:'GE',GHA:'GH',
  GIN:'GN',GMB:'GM',GNB:'GW',GNQ:'GQ',GRC:'GR',GRD:'GD',GTM:'GT',GUY:'GY',
  HND:'HN',HRV:'HR',HTI:'HT',HUN:'HU',IDN:'ID',IND:'IN',IRL:'IE',IRN:'IR',
  IRQ:'IQ',ISL:'IS',ISR:'IL',ITA:'IT',JAM:'JM',JOR:'JO',JPN:'JP',KAZ:'KZ',
  KEN:'KE',KGZ:'KG',KHM:'KH',KIR:'KI',KNA:'KN',KOR:'KR',KWT:'KW',LAO:'LA',
  LBN:'LB',LBR:'LR',LBY:'LY',LCA:'LC',LIE:'LI',LKA:'LK',LSO:'LS',LTU:'LT',
  LUX:'LU',LVA:'LV',MAR:'MA',MCO:'MC',MDA:'MD',MDG:'MG',MDV:'MV',MEX:'MX',
  MHL:'MH',MKD:'MK',MLI:'ML',MLT:'MT',MMR:'MM',MNE:'ME',MNG:'MN',MOZ:'MZ',
  MRT:'MR',MUS:'MU',MWI:'MW',MYS:'MY',NAM:'NA',NER:'NE',NGA:'NG',NIC:'NI',
  NLD:'NL',NOR:'NO',NPL:'NP',NRU:'NR',NZL:'NZ',OMN:'OM',PAK:'PK',PAN:'PA',
  PER:'PE',PHL:'PH',PLW:'PW',PNG:'PG',POL:'PL',PRK:'KP',PRT:'PT',PRY:'PY',
  PSE:'PS',QAT:'QA',ROM:'RO',ROU:'RO',RUS:'RU',RWA:'RW',SAU:'SA',SDN:'SD',
  SEN:'SN',SGP:'SG',SLB:'SB',SLE:'SL',SLV:'SV',SMR:'SM',SOM:'SO',SRB:'RS',
  SSD:'SS',STP:'ST',SUR:'SR',SVK:'SK',SVN:'SI',SWE:'SE',SWZ:'SZ',SYC:'SC',
  SYR:'SY',TCD:'TD',TGO:'TG',THA:'TH',TJK:'TJ',TKM:'TM',TLS:'TL',TON:'TO',
  TTO:'TT',TUN:'TN',TUR:'TR',TUV:'TV',TZA:'TZ',UGA:'UG',UKR:'UA',URY:'UY',
  USA:'US',UZB:'UZ',VAT:'VA',VCT:'VC',VEN:'VE',VNM:'VN',VUT:'VU',WSM:'WS',
  YEM:'YE',ZAF:'ZA',ZMB:'ZM',ZWE:'ZW',COK:'CK',NIU:'NU',TKL:'TK',
  // GDELT sometimes uses non-standard codes
  UK:'GB', KOS:'XK', XKX:'XK',
};

module.exports = function iso3to2(code3) {
  if (!code3) return null;
  const c = code3.trim().toUpperCase();
  if (c.length === 2) return c; // already ISO2
  return MAP[c] || null;
};
