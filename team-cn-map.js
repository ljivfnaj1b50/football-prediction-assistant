export const TEAM_CN = {
  'FC Bayern München':'拜仁慕尼黑','Bayern Munich':'拜仁慕尼黑','Borussia Dortmund':'多特蒙德','RB Leipzig':'莱比锡红牛','Bayer 04 Leverkusen':'勒沃库森','Bayer Leverkusen':'勒沃库森','VfB Stuttgart':'斯图加特','Eintracht Frankfurt':'法兰克福','TSG Hoffenheim':'霍芬海姆','Werder Bremen':'云达不莱梅','VfL Wolfsburg':'沃尔夫斯堡','1. FSV Mainz 05':'美因茨','Mainz 05':'美因茨','SC Freiburg':'弗赖堡','Borussia Mönchengladbach':'门兴格拉德巴赫','Union Berlin':'柏林联合','1. FC Union Berlin':'柏林联合','FC Augsburg':'奥格斯堡','VfL Bochum':'波鸿','Holstein Kiel':'基尔','FC St. Pauli':'圣保利','1. FC Köln':'科隆','Hamburger SV':'汉堡','FC Schalke 04':'沙尔克04','Hertha BSC':'柏林赫塔','Hannover 96':'汉诺威96','1. FC Nürnberg':'纽伦堡','Fortuna Düsseldorf':'杜塞尔多夫','Karlsruher SC':'卡尔斯鲁厄','1. FC Kaiserslautern':'凯泽斯劳滕','SC Paderborn 07':'帕德博恩','SV Darmstadt 98':'达姆施塔特','SV Elversberg':'埃弗斯堡','1. FC Magdeburg':'马格德堡','Preußen Münster':'明斯特','Jahn Regensburg':'雷根斯堡','Eintracht Braunschweig':'不伦瑞克','Greuther Fürth':'菲尔特','SSV Ulm 1846':'乌尔姆',
  'MEX':'墨西哥','Mexico':'墨西哥','Mexiko':'墨西哥','RSA':'南非','South Africa':'南非','Südafrika':'南非','KOR':'韩国','Korea Republic':'韩国','South Korea':'韩国','CZE':'捷克','Czech Republic':'捷克','CAN':'加拿大','Canada':'加拿大','BIH':'波黑','Bosnia and Herzegovina':'波黑','ARG':'阿根廷','Argentina':'阿根廷','Argentinien':'阿根廷','Argentine':'阿根廷','Argentina U20':'阿根廷U20','EGY':'埃及','Egypt':'埃及','Ägypten':'埃及','Egypt U20':'埃及U20','CHE':'瑞士','Switzerland':'瑞士','Schweiz':'瑞士','COL':'哥伦比亚','Colombia':'哥伦比亚','Kolumbien':'哥伦比亚','FRA':'法国','France':'法国','Frankreich':'法国','MAR':'摩洛哥','Morocco':'摩洛哥','Marokko':'摩洛哥','ESP':'西班牙','Spain':'西班牙','Spanien':'西班牙','BEL':'比利时','Belgium':'比利时','Belgien':'比利时','NOR':'挪威','Norway':'挪威','Norwegen':'挪威','ENG':'英格兰','England':'英格兰','BRA':'巴西','Brazil':'巴西','Brasilien':'巴西','USA':'美国','United States':'美国','Vereinigte Staaten':'美国','PAR':'巴拉圭','Paraguay':'巴拉圭','GER':'德国','Germany':'德国','Deutschland':'德国','JPN':'日本','Japan':'日本','NLD':'荷兰','Netherlands':'荷兰','Niederlande':'荷兰','POR':'葡萄牙','Portugal':'葡萄牙','PRT':'葡萄牙','ITA':'意大利','Italy':'意大利','Italien':'意大利','URU':'乌拉圭','Uruguay':'乌拉圭','SEN':'塞内加尔','Senegal':'塞内加尔','IRN':'伊朗','Iran':'伊朗','AUS':'澳大利亚','Australia':'澳大利亚','Australien':'澳大利亚','TUR':'土耳其','Turkey':'土耳其','Türkei':'土耳其','CIV':'科特迪瓦','ECU':'厄瓜多尔','Ecuador':'厄瓜多尔','SWE':'瑞典','Sweden':'瑞典','Schweden':'瑞典','HRV':'克罗地亚','Croatia':'克罗地亚','Kroatien':'克罗地亚','QAT':'卡塔尔','Qatar':'卡塔尔'
};

export const TEXT_CN = {
  'WM 2026':'世界杯 2026','World Cup 2026':'世界杯 2026','FIFA World Cup':'世界杯','FIFA World Cup 2026':'世界杯 2026','World Cup':'世界杯','FIFA U-20 World Cup':'U20世界杯','U20 World Cup':'U20世界杯',
  'Achtelfinale':'16强淘汰赛','Round of 16':'16强淘汰赛','Viertelfinale':'8强淘汰赛','Quarterfinal':'8强淘汰赛','Halbfinale':'半决赛','Semifinal':'半决赛','Finale':'决赛','Final':'决赛','Spiel um Platz 3':'三四名决赛','Group Stage':'小组赛','Gruppenphase':'小组赛',
  'Premier League':'英超','English Premier League':'英超','Spanish LALIGA':'西甲','Italian Serie A':'意甲','German Bundesliga':'德甲','French Ligue 1':'法甲','MLS':'美职联','Mexican Liga BBVA MX':'墨西哥联赛','Brazilian Serie A':'巴甲','Argentine Liga Profesional de Fútbol':'阿根廷甲级联赛','Chinese Super League':'中超'
};

export function cnName(name = '') {
  const key = String(name || '').trim();
  return TEAM_CN[key] || key;
}

export function cnText(text = '') {
  const key = String(text || '').trim();
  if (!key) return key;
  if (TEXT_CN[key]) return TEXT_CN[key];
  return key
    .replace(/\bWM\b/g, '世界杯')
    .replace(/Achtelfinale/g, '16强淘汰赛')
    .replace(/Viertelfinale/g, '8强淘汰赛')
    .replace(/Halbfinale/g, '半决赛')
    .replace(/Finale/g, '决赛');
}

export function localizeMatch(match) {
  if (!match) return match;
  match.home = match.home || {};
  match.away = match.away || {};
  match.home.rawName = match.home.rawName || match.home.name;
  match.away.rawName = match.away.rawName || match.away.name;
  match.home.name = cnName(match.home.name);
  match.away.name = cnName(match.away.name);
  match.competition = cnText(match.competition);
  match.stage = cnText(match.stage);
  match.jcNum = match.jcNum || match.matchNumStr || match.matchNo || match.issueNum || '';
  return match;
}
