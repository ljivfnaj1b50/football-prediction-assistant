export const TEAM_CN = {
  'FC Bayern München':'拜仁慕尼黑','Bayern Munich':'拜仁慕尼黑','Borussia Dortmund':'多特蒙德','RB Leipzig':'莱比锡红牛','Bayer 04 Leverkusen':'勒沃库森','Bayer Leverkusen':'勒沃库森','VfB Stuttgart':'斯图加特','Eintracht Frankfurt':'法兰克福','TSG Hoffenheim':'霍芬海姆','Werder Bremen':'云达不莱梅','VfL Wolfsburg':'沃尔夫斯堡','1. FSV Mainz 05':'美因茨','Mainz 05':'美因茨','SC Freiburg':'弗赖堡','Borussia Mönchengladbach':'门兴格拉德巴赫','Union Berlin':'柏林联合','1. FC Union Berlin':'柏林联合','FC Augsburg':'奥格斯堡','VfL Bochum':'波鸿','Holstein Kiel':'基尔','FC St. Pauli':'圣保利','1. FC Köln':'科隆','Hamburger SV':'汉堡','FC Schalke 04':'沙尔克04','Hertha BSC':'柏林赫塔','Hannover 96':'汉诺威96','1. FC Nürnberg':'纽伦堡','Fortuna Düsseldorf':'杜塞尔多夫','Karlsruher SC':'卡尔斯鲁厄','1. FC Kaiserslautern':'凯泽斯劳滕','SC Paderborn 07':'帕德博恩','SV Darmstadt 98':'达姆施塔特','SV Elversberg':'埃弗斯堡','1. FC Magdeburg':'马格德堡','Preußen Münster':'明斯特','Jahn Regensburg':'雷根斯堡','Eintracht Braunschweig':'不伦瑞克','Greuther Fürth':'菲尔特','SSV Ulm 1846':'乌尔姆',
  'MEX':'墨西哥','Mexico':'墨西哥','Mexiko':'墨西哥','RSA':'南非','South Africa':'南非','Südafrika':'南非','KOR':'韩国','Korea Republic':'韩国','South Korea':'韩国','CZE':'捷克','Czech Republic':'捷克','CAN':'加拿大','Canada':'加拿大','BIH':'波黑','Bosnia and Herzegovina':'波黑','ARG':'阿根廷','Argentina':'阿根廷','EGY':'埃及','Egypt':'埃及','CHE':'瑞士','Switzerland':'瑞士','COL':'哥伦比亚','Colombia':'哥伦比亚','FRA':'法国','France':'法国','MAR':'摩洛哥','Morocco':'摩洛哥','ESP':'西班牙','Spain':'西班牙','BEL':'比利时','Belgium':'比利时','NOR':'挪威','Norway':'挪威','ENG':'英格兰','England':'英格兰','BRA':'巴西','Brazil':'巴西','USA':'美国','PAR':'巴拉圭','Paraguay':'巴拉圭','GER':'德国','Germany':'德国','JPN':'日本','Japan':'日本','NLD':'荷兰','Netherlands':'荷兰','POR':'葡萄牙','Portugal':'葡萄牙','PRT':'葡萄牙','ITA':'意大利','Italy':'意大利','URU':'乌拉圭','Uruguay':'乌拉圭','SEN':'塞内加尔','Senegal':'塞内加尔','IRN':'伊朗','Iran':'伊朗','AUS':'澳大利亚','Australia':'澳大利亚','TUR':'土耳其','Turkey':'土耳其','CIV':'科特迪瓦','ECU':'厄瓜多尔','Ecuador':'厄瓜多尔','SWE':'瑞典','Sweden':'瑞典','HRV':'克罗地亚','Croatia':'克罗地亚','QAT':'卡塔尔','Qatar':'卡塔尔'
};

export function cnName(name = '') {
  const key = String(name || '').trim();
  return TEAM_CN[key] || key;
}

export function localizeMatch(match) {
  if (!match) return match;
  match.home = match.home || {};
  match.away = match.away || {};
  match.home.rawName = match.home.rawName || match.home.name;
  match.away.rawName = match.away.rawName || match.away.name;
  match.home.name = cnName(match.home.name);
  match.away.name = cnName(match.away.name);
  match.jcNum = match.jcNum || match.matchNumStr || match.matchNo || match.issueNum || '';
  return match;
}
