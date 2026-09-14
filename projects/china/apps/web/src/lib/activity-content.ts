export type MatchCard = {
  id: string;
  hanzi: string;
  pinyin: string;
  english: string;
  color: "green" | "blue" | "red" | "gold";
  audio?: string;
};
const card = (
  hanzi: string,
  pinyin: string,
  english: string,
  color: MatchCard["color"] = "green",
): MatchCard => ({ id: hanzi, hanzi, pinyin, english, color });
const street = [
  card("卫生间", "wèishēngjiān", "Restroom", "blue"),
  card("出口", "chūkǒu", "Exit"),
  card("入口", "rùkǒu", "Entrance"),
  card("地铁", "dìtiě", "Subway", "blue"),
  card("男", "nán", "Men", "blue"),
  card("女", "nǚ", "Women", "blue"),
];
export const emergencyNumbers = [
  { ...card("120", "yāo èr líng", "Ambulance", "red"), audio: "幺二零。" },
  { ...card("110", "yāo yāo líng", "Police", "blue"), audio: "幺幺零。" },
  { ...card("119", "yāo yāo jiǔ", "Fire service", "red"), audio: "幺幺九。" },
];
export function matchingFor(missionId: string): MatchCard[] {
  switch (missionId) {
    case "basics":
      return [
        card("你", "nǐ", "You", "gold"),
        card("好", "hǎo", "Good", "gold"),
        ...street.slice(0, 3),
      ];
    case "groom":
      return [
        card("埃里克", "Āilǐkè", "Eric", "gold"),
        card("非常", "fēicháng", "Very", "gold"),
        card("帅", "shuài", "Handsome", "gold"),
        card("你", "nǐ", "You", "gold"),
        card("我", "wǒ", "I / me", "gold"),
      ];
    case "feast":
      return [
        card("牛肉", "niúròu", "Beef", "gold"),
        card("猪肉", "zhūròu", "Pork", "gold"),
        card("鸡肉", "jīròu", "Chicken", "gold"),
        card("鱼", "yú", "Fish", "gold"),
        card("饺子", "jiǎozi", "Dumplings", "gold"),
        card("米饭", "mǐfàn", "Rice", "gold"),
      ];
    case "market":
      return [
        card("单价", "dānjià", "Unit price", "gold"),
        card("总价", "zǒngjià", "Total price", "gold"),
        card("每人", "měi rén", "Per person", "blue"),
        card("每份", "měi fèn", "Per portion", "blue"),
        card("不议价", "bù yìjià", "No bargaining", "red"),
        card("元", "yuán", "Yuan", "gold"),
      ];
    case "payment":
      return [
        card("现金", "xiànjīn", "Cash", "gold"),
        card("支付宝", "Zhīfùbǎo", "Alipay", "blue"),
        card("信用卡", "xìnyòngkǎ", "Credit card", "blue"),
        card("元", "yuán", "Yuan", "gold"),
        card("买单", "mǎidān", "Pay the bill", "gold"),
      ];
    case "train":
      return [
        card("检票口", "jiǎnpiàokǒu", "Ticket-check gate", "blue"),
        card("出站口", "chūzhànkǒu", "Station exit"),
        card("座位", "zuòwèi", "Seat", "blue"),
        card("高铁", "gāotiě", "High-speed train", "blue"),
        ...street.slice(1, 3),
      ];
    case "night":
      return [
        card("啤酒", "píjiǔ", "Beer", "gold"),
        card("水", "shuǐ", "Water", "blue"),
        card("干杯", "gānbēi", "Cheers", "gold"),
        card("禁止吸烟", "jìnzhǐ xīyān", "No smoking", "red"),
        card("谢谢", "xièxie", "Thank you", "gold"),
      ];
    case "ktv":
      return [
        card("包间", "bāojiān", "Private room", "gold"),
        card("歌曲", "gēqǔ", "Songs", "gold"),
        card("账单", "zhàngdān", "Bill", "gold"),
        card("出租车", "chūzūchē", "Taxi", "blue"),
        card("酒店", "jiǔdiàn", "Hotel", "blue"),
      ];
    case "rescue":
      return [
        ...emergencyNumbers,
        card("医院", "yīyuàn", "Hospital", "red"),
        card("帮助", "bāngzhù", "Help", "red"),
      ];
    default:
      return street;
  }
}
export const restaurantVideo = {
  id: "_MT2kEo2X7Q",
  creator: "Chinese with Xiaonita",
  title: "Dining vocabulary in a real restaurant",
  fallback: "你好。我们要两份饺子。不要太辣。谢谢。",
  fallbackPinyin: "Nǐ hǎo. Wǒmen yào liǎng fèn jiǎozi. Bú yào tài là. Xièxie.",
  fallbackMeaning: "Hello. We’d like two portions of dumplings. Not too spicy. Thank you.",
};
