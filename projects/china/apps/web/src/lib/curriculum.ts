import { type MatchCard, matchingFor } from "./activity-content.ts";
import { hypeFor, type TripHype } from "./trip-hype.ts";
export type Phrase = { hanzi: string; pinyin: string; english: string; tip: string };
export type Mission = {
  id: string;
  title: string;
  city: string;
  label: string;
  icon: string;
  story: string;
  phrases: Phrase[];
  matches?: MatchCard[];
  hype?: TripHype[];
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};
export const groom = "Eric";
export const crew = [
  groom,
  "Gavin",
  "Timmy",
  "Kendall",
  "Ivan",
  "Seth",
  "Alfredo",
  "Miles",
  "Andrew",
  "Jarrell",
  "Skylar",
  "Carlo",
  "Brent",
  "Dennis",
  "Josh",
  "Ty",
  "Donovan",
  "Jack",
  "Rolo",
];
export const missions: Mission[] = [
  {
    id: "arrival",
    title: "Nobody loses Rolo.",
    city: "Beijing",
    label: "ARRIVAL & SURVIVAL",
    icon: "↗",
    story:
      "Eric’s bachelor trip has officially landed in Beijing. His Mandarin has not. Gavin has the booking. Timmy has 4% battery. Rolo has wandered toward a sign he absolutely cannot read. Get the boys to the hotel without making the best man run a fucking help desk.",
    phrases: [
      {
        hanzi: "厕所在哪里？",
        pinyin: "Cèsuǒ zài nǎlǐ?",
        english: "Where is the toilet?",
        tip: "厕所 = toilet. 在哪里 = where is? Say the place, then zài nǎlǐ. This reusable pattern is worth more than memorizing ten random sentences.",
      },
      {
        hanzi: "我要水。",
        pinyin: "Wǒ yào shuǐ.",
        english: "I’d like water.",
        tip: "我 = I. 要 = want. 水 = water. Three chunks, one useful sentence. Add 谢谢 at the end to be polite.",
      },
      {
        hanzi: "多少钱？",
        pinyin: "Duōshao qián?",
        english: "How much is it?",
        tip: "多少 = how much. 钱 = money. Ask them to show you the price if you don’t understand the answer.",
      },
      {
        hanzi: "请说慢一点。",
        pinyin: "Qǐng shuō màn yìdiǎn.",
        english: "Please speak a little slower.",
        tip: "请 = please. 说 = speak. 慢一点 = a little slower. This goes nicely after 听不懂 from your first mission.",
      },
    ],
    question: "Rolo needs the subway. Which sign are you following?",
    options: ["出口", "地铁", "卫生间"],
    answer: 1,
    explanation: "地铁 = subway. 出口 = exit. 卫生间 = restroom.",
  },
  {
    id: "feast",
    title: "The whole crew. One menu.",
    city: "Beijing",
    label: "FOOD & ORDERING",
    icon: "饺",
    story:
      "Eric asked for a legendary bachelor dinner, not a group colonoscopy. Kendall says she can handle spicy. Her asshole has not been consulted. Ivan wants dumplings. Seth and Alfredo have pointed at six mystery dishes. Order dinner before confidence becomes a medical event.",
    phrases: [
      {
        hanzi: "菜单，谢谢。",
        pinyin: "Càidān, xièxie.",
        english: "The menu, please.",
        tip: "菜单 = menu. A thing + 谢谢 is an easy, polite request. Point to a dish and say 这个 (zhège), ‘this one’, when words fail.",
      },
      {
        hanzi: "我们要两份饺子。",
        pinyin: "Wǒmen yào liǎng fèn jiǎozi.",
        english: "We’d like two portions of dumplings.",
        tip: "两 is ‘two’ before a measure word. 一份 (yí fèn) is one portion.",
      },
      {
        hanzi: "不要太辣。",
        pinyin: "Bú yào tài là.",
        english: "Not too spicy, please.",
        tip: "不辣 (bú là) = not spicy. 微辣 (wēi là) = mildly spicy. Confidence is not a spice tolerance.",
      },
      {
        hanzi: "这个里面有花生吗？",
        pinyin: "Zhège lǐmiàn yǒu huāshēng ma?",
        english: "Does this contain peanuts?",
        tip: "For serious allergies, carry a professionally translated allergy card. This question alone is not a safety guarantee.",
      },
    ],
    question: "Which menu item is Beijing roast duck?",
    options: ["牛肉面", "北京烤鸭", "猪肉饺子"],
    answer: 1,
    explanation: "北京烤鸭 = Beijing roast duck. 牛肉面 = beef noodles. 猪肉饺子 = pork dumplings.",
  },
  {
    id: "wall",
    title: "The Great Wall. Leg day.",
    city: "Beijing",
    label: "THE GREAT WALL",
    icon: "山",
    story:
      "Eric’s bachelor trip has somehow become leg day. Miles called this a casual walk. Andrew has become a motivational speaker. Jarrell’s calves have filed for divorce. Nobody came to China to die doing fucking cardio. Find water and the way back.",
    phrases: [
      {
        hanzi: "我要一瓶水。",
        pinyin: "Wǒ yào yì píng shuǐ.",
        english: "I’d like a bottle of water.",
        tip: "瓶 is the measure word for bottles. 水 has a dipping third tone.",
      },
      {
        hanzi: "多少钱？",
        pinyin: "Duōshao qián?",
        english: "How much is it?",
        tip: "Useful everywhere. Ask them to show the number if the answer flies past you.",
      },
      {
        hanzi: "出口往哪边走？",
        pinyin: "Chūkǒu wǎng nǎ biān zǒu?",
        english: "Which way is the exit?",
        tip: "左 (zuǒ) = left. 右 (yòu) = right. 一直走 (yìzhí zǒu) = go straight.",
      },
    ],
    question: "Andrew points at 入口. Is that the exit?",
    options: ["Yes, escape the stairs", "No, that’s the entrance", "That’s the cable car"],
    answer: 1,
    explanation: "入口 = entrance. 出口 = exit. 缆车 (lǎnchē) = cable car.",
  },
  {
    id: "palace",
    title: "Forbidden City. Allowed idiots.",
    city: "Beijing",
    label: "SIGHTS & SIGNS",
    icon: "门",
    story:
      "Eric wants a group photo, not a mugshot. Skylar is directing a group photo like a porno with a very disappointing cast. Carlo wants the perfect angle. Brent is testing whether ‘Forbidden City’ is a suggestion. The itinerary does not include jail. Read the signs.",
    phrases: [
      {
        hanzi: "可以帮我们拍张照片吗？",
        pinyin: "Kěyǐ bāng wǒmen pāi zhāng zhàopiàn ma?",
        english: "Could you take a photo of us?",
        tip: "Hand over the phone only after they agree. 谢谢 (xièxie) = thank you.",
      },
      {
        hanzi: "这里可以拍照吗？",
        pinyin: "Zhèlǐ kěyǐ pāizhào ma?",
        english: "Can we take photos here?",
        tip: "禁止拍照 means photography is prohibited. A great angle is not an exemption.",
      },
      {
        hanzi: "我们有预约。",
        pinyin: "Wǒmen yǒu yùyuē.",
        english: "We have a reservation.",
        tip: "Have booking details and passports ready. Check current entry requirements before the trip.",
      },
    ],
    question: "The sign says 禁止吸烟. What’s the move?",
    options: ["Light up", "No smoking here", "Find the ticket office"],
    answer: 1,
    explanation: "禁止 = prohibited. 吸烟 = smoking. Respect posted signs and designated areas.",
  },
  {
    id: "train",
    title: "Next stop: Shanghai.",
    city: "Beijing → Shanghai",
    label: "TRAINS & DIRECTIONS",
    icon: "→",
    story:
      "The boys have one job: get Eric to Shanghai with his passport and dignity. One of those is negotiable. Dennis has appointed himself logistics captain. Josh and Ty are debating snacks. Donovan is at the wrong gate with unbelievable confidence. Get everyone on the same train.",
    phrases: [
      {
        hanzi: "这是去上海的高铁吗？",
        pinyin: "Zhè shì qù Shànghǎi de gāotiě ma?",
        english: "Is this the high-speed train to Shanghai?",
        tip: "Match the train number on your ticket, not just the destination.",
      },
      {
        hanzi: "检票口在哪里？",
        pinyin: "Jiǎnpiàokǒu zài nǎlǐ?",
        english: "Where is the ticket gate?",
        tip: "检票口 is the boarding gate. 出站口 is the station exit.",
      },
      {
        hanzi: "不好意思，这是我的座位。",
        pinyin: "Bù hǎoyìsi, zhè shì wǒ de zuòwèi.",
        english: "Excuse me, this is my seat.",
        tip: "Show the seat number. 不好意思 softens an interruption.",
      },
    ],
    question: "Which sign gets Donovan to the boarding gate?",
    options: ["出站口", "售票处", "检票口"],
    answer: 2,
    explanation: "检票口 = ticket gate. 售票处 = ticket office. 出站口 = station exit.",
  },
  {
    id: "night",
    title: "Jack orders the next round.",
    city: "Shanghai",
    label: "BARS & NIGHTLIFE",
    icon: "夜",
    story:
      "It’s Eric’s bachelor toast, and Jack is buying. Rolo has reappeared with the confidence of a man whose blood is now mostly beer. Gavin’s toast is longer than his last relationship. Nobody wants to explain this night to a consulate. Order, pace yourselves, and keep the boys together.",
    phrases: [
      {
        hanzi: "干杯！",
        pinyin: "Gānbēi!",
        english: "Cheers!",
        tip: "Literally ‘dry cup’. Some people mean finish the drink; you can still sip or decline. 随意 (suíyì) means ‘as you like’. A toast is not a court order.",
      },
      {
        hanzi: "请来四杯啤酒。",
        pinyin: "Qǐng lái sì bēi píjiǔ.",
        english: "Four glasses of beer, please.",
        tip: "杯 = glass/cup. 瓶 = bottle. 四 is a sharp falling tone; don’t accidentally order ten (十, shí).",
      },
      {
        hanzi: "我不喝酒，谢谢。",
        pinyin: "Wǒ bù hē jiǔ, xièxie.",
        english: "I don’t drink alcohol, thank you.",
        tip: "A complete answer. Nobody owes the group another drink.",
      },
      {
        hanzi: "请问，哪里可以抽烟？",
        pinyin: "Qǐngwèn, nǎlǐ kěyǐ chōuyān?",
        english: "Excuse me, where is smoking allowed?",
        tip: "Ask staff and follow local rules. Never assume indoor smoking is allowed.",
      },
    ],
    question: "The bartender asks 几杯？ (jǐ bēi). What do they want to know?",
    options: ["How many glasses?", "What time is it?", "Who lost Rolo?"],
    answer: 0,
    explanation:
      "几 = how many; 杯 = glasses/cups. 一、两、三、四: one, two, three, four (before 杯).",
  },
  {
    id: "ktv",
    title: "KTV. Zero vocal talent required.",
    city: "Shanghai",
    label: "KARAOKE & THE RIDE HOME",
    icon: "♫",
    story:
      "Eric has been summoned to the microphone. This is a bachelor trip, not a fucking talent show. Timmy and Alfredo have formed a boy band called Public Indecency. Kendall is negotiating an encore. The best man is one mistranslation from charging by the hour. Book the room, settle up, and get everybody home before this becomes a deposition.",
    phrases: [
      {
        hanzi: "有英文歌吗？",
        pinyin: "Yǒu Yīngwén gē ma?",
        english: "Do you have English songs?",
        tip: "有 = have. 英文歌 = English songs. 吗 turns this into a yes/no question. You have permission to butcher a song you actually know.",
      },
      {
        hanzi: "我们想要一个大包间。",
        pinyin: "Wǒmen xiǎng yào yí ge dà bāojiān.",
        english: "We’d like a large private room.",
        tip: "KTV is usually private-room karaoke. Confirm the price and how long you get.",
      },
      {
        hanzi: "买单，谢谢。",
        pinyin: "Mǎidān, xièxie.",
        english: "The bill, please. Thank you.",
        tip: "Also useful after dinner. Ask 可以刷卡吗？ (Kěyǐ shuākǎ ma?) to check card payment.",
      },
      {
        hanzi: "我们回酒店吧。",
        pinyin: "Wǒmen huí jiǔdiàn ba.",
        english: "Let’s go back to the hotel.",
        tip: "吧 makes this a suggestion. Save your hotel address in Chinese before going out.",
      },
    ],
    question: "账单 says 包间费. What is it?",
    options: ["A dumpling charge", "A private-room charge", "An encore request"],
    answer: 1,
    explanation:
      "包间 = private room. 费 = fee. Confirm room charges and minimum spend before booking.",
  },
];
missions.unshift({
  id: "basics",
  title: "American volume is not a language.",
  city: "Before takeoff",
  label: "YOUR FIRST FIVE MINUTES",
  icon: "声",
  story:
    "Eric is the groom. Planning a China bachelor trip before learning to say hello is exactly the kind of decision the boys have come to support. Gavin’s plan is to speak English louder. Timmy’s plan is to point. Neither is a language. Learn a polite opener, a bathroom escape hatch, and how to admit you have absolutely no idea what’s happening.",
  phrases: [
    {
      hanzi: "你好。",
      pinyin: "Nǐ hǎo.",
      english: "Hello.",
      tip: "Start here. 你 means you; 好 means good. Pinyin (the Latin letters) guides pronunciation; it is not English spelling. When two third tones meet, the first rises: this sounds like ní hǎo.",
    },
    {
      hanzi: "谢谢。",
      pinyin: "Xièxie.",
      english: "Thank you.",
      tip: "The first syllable falls; the second is light and short. Mandarin x is a soft, forward ‘sh’-like sound—not English ‘ks’. Listen rather than trusting English sound-alikes.",
    },
    {
      hanzi: "不好意思。",
      pinyin: "Bù hǎoyìsi.",
      english: "Excuse me.",
      tip: "A polite way to interrupt, squeeze past someone, or apologize for a small inconvenience. Learn it as one useful chunk.",
    },
    {
      hanzi: "听不懂。",
      pinyin: "Tīng bù dǒng.",
      english: "I don’t understand what I’m hearing.",
      tip: "听 = listen. 不 = not. 懂 = understand. You can leave out ‘I’ when context is clear. Use this instead of the international panic-nod.",
    },
  ],
  question: "You need a restroom, not a dramatic incident. Find the sign.",
  options: ["卫生间", "出口", "禁止进入"],
  answer: 0,
  explanation: "卫生间 (wèishēngjiān) = restroom. 出口 = exit. 禁止进入 = no entry.",
});
missions.splice(3, 0, {
  id: "payment",
  title: "Your Visa has trust issues.",
  city: "Both cities",
  label: "PAYMENTS & NUMBERS",
  icon: "¥",
  story:
    "Eric is the bachelor, not the emergency ATM. Carlo announces he’s got the bill. The terminal disagrees. Brent is waving an American credit card like a diplomatic passport. Learn to pay before the boys start pitching dishwashing as cultural immersion.",
  phrases: [
    {
      hanzi: "可以用支付宝吗？",
      pinyin: "Kěyǐ yòng Zhīfùbǎo ma?",
      english: "Can I use Alipay?",
      tip: "Set up and test Alipay or Weixin Pay before leaving. Foreign-card support varies by transaction; carry a backup payment method.",
    },
    {
      hanzi: "可以刷卡吗？",
      pinyin: "Kěyǐ shuākǎ ma?",
      english: "Can I pay by card?",
      tip: "Do not assume a foreign card works just because you see a card reader.",
    },
    {
      hanzi: "可以付现金吗？",
      pinyin: "Kěyǐ fù xiànjīn ma?",
      english: "Can I pay cash?",
      tip: "元 (yuán) and 块 (kuài) both refer to yuan in prices. Keep some RMB for backup.",
    },
    {
      hanzi: "请把价格写下来。",
      pinyin: "Qǐng bǎ jiàgé xiě xiàlái.",
      english: "Please write down the price.",
      tip: "十 10 · 二十 20 · 五十 50 · 一百 100. Reading the number beats guessing with your money.",
    },
  ],
  question: "A menu says 啤酒 28元 / 瓶. What are you buying?",
  options: ["28 bottles of beer", "One bottle of beer for 28 yuan", "A 28-yuan glass of wine"],
  answer: 1,
  explanation:
    "啤酒 = beer. 元 = yuan. 瓶 = bottle. Watch the unit: 杯 means glass and 份 means portion.",
});
missions.push({
  id: "rescue",
  title: "The consulate is not your group chat.",
  city: "Both cities",
  label: "HELP & GETTING HOME",
  icon: "+",
  story:
    "Eric would like the boys at his wedding, not featured in a consular incident report. Dennis is doing a headcount. Donovan is rehearsing ‘I can explain.’ Josh is asking whether the group chat counts as legal representation. Jail jokes belong in the group chat; real trouble gets a sober response. These phrases are not the punchline.",
  phrases: [
    {
      hanzi: "请帮帮我。",
      pinyin: "Qǐng bāngbang wǒ.",
      english: "Please help me.",
      tip: "Start here. Ask hotel staff or another trusted person to help you communicate.",
    },
    {
      hanzi: "请叫救护车。",
      pinyin: "Qǐng jiào jiùhùchē.",
      english: "Please call an ambulance.",
      tip: "Mainland China: ambulance 120, police 110, fire 119. Give your location. If someone cannot be woken or is breathing abnormally, call for help; don’t let them ‘sleep it off’.",
    },
    {
      hanzi: "我的朋友不舒服。",
      pinyin: "Wǒ de péngyou bù shūfu.",
      english: "My friend feels unwell.",
      tip: "Use this with staff or a clinician. Don’t rely on a phrasebook for diagnosis or medical translation.",
    },
    {
      hanzi: "我需要翻译。",
      pinyin: "Wǒ xūyào fānyì.",
      english: "I need an interpreter.",
      tip: "For medical or legal trouble, get qualified help. An app is not an interpreter or lawyer.",
    },
    {
      hanzi: "我想联系美国大使馆或领事馆。",
      pinyin: "Wǒ xiǎng liánxì Měiguó dàshǐguǎn huò lǐngshìguǎn.",
      english: "I’d like to contact the U.S. embassy or consulate.",
      tip: "Save current embassy/consulate contact details before departure. Consular help is not immunity from local law.",
    },
  ],
  question: "Someone is unresponsive after drinking. What number calls an ambulance?",
  options: ["120", "110", "119"],
  answer: 0,
  explanation:
    "120 = ambulance in mainland China. 110 = police. 119 = fire. Give the exact location and seek immediate help.",
});
missions.push({
  id: "groom",
  title: "Eric is very handsome. Allegedly.",
  city: "Groom-approved curriculum",
  label: "COMPLIMENTS & BACHELOR PROPAGANDA",
  icon: "帅",
  story:
    "Eric has reviewed the curriculum and identified a critical omission: his own face. Gavin calls it propaganda. Kendall demands a peer review. The boys will learn compliments, because apparently the groom now controls the fucking syllabus.",
  phrases: [
    {
      hanzi: "帅！",
      pinyin: "Shuài!",
      english: "Handsome!",
      tip: "One syllable, one falling tone. 帅 describes a handsome or cool-looking person. This is vocabulary, not an independent review of the groom.",
    },
    {
      hanzi: "你很帅。",
      pinyin: "Nǐ hěn shuài.",
      english: "You’re handsome.",
      tip: "你 = you. 很 is commonly used before an adjective in a neutral statement; it doesn’t always strongly mean ‘very’. Mandarin doesn’t need an English-style ‘are’ here.",
    },
    {
      hanzi: "埃里克非常帅。",
      pinyin: "Āilǐkè fēicháng shuài.",
      english: "Eric is very handsome.",
      tip: "埃里克 is Eric written phonetically in Chinese. 非常 makes the ‘very’ explicit. Swap the name or pronoun and you have a reusable compliment—not just groom propaganda.",
    },
  ],
  question: "Which part explicitly means VERY in 埃里克非常帅?",
  options: ["埃里克", "非常", "帅"],
  answer: 1,
  explanation:
    "非常 = very. 埃里克 = Eric; 帅 = handsome. The grammar is legitimate. The editorial independence is nonexistent.",
});
missions.push({
  id: "market",
  title: "Carlo is negotiating against himself.",
  city: "Markets, not every checkout",
  label: "PRICES, BARGAINING & KEEPING YOUR MONEY",
  icon: "价",
  story:
    "Eric wants a souvenir. Carlo has somehow raised his own offer twice. Seth thinks every QR code is a coupon. Learn the price, check whether bargaining is welcome, make one calm counteroffer, and leave with a thing you actually wanted—not a fucking financial incident.",
  phrases: [
    {
      hanzi: "一个多少钱？",
      pinyin: "Yí ge duōshao qián?",
      english: "How much for one?",
      tip: "Ask for the unit price before negotiating. One item, one person, one portion, and the full group are different prices. Confirm the currency is RMB / yuan.",
    },
    {
      hanzi: "一共多少钱？",
      pinyin: "Yígòng duōshao qián?",
      english: "How much altogether?",
      tip: "一共 = altogether. Confirm the complete price and what it includes before accepting goods, a tasting, a ride, or a service. A low per-person price can become a large crew total.",
    },
    {
      hanzi: "可以便宜一点吗？",
      pinyin: "Kěyǐ piányi yìdiǎn ma?",
      english: "Could it be a little cheaper?",
      tip: "Useful when a market stall welcomes bargaining. Smile and ask; accept a no. Supermarkets, posted-price chains, restaurants, transit, and most app checkouts are not a bargaining game.",
    },
    {
      hanzi: "一百元可以吗？",
      pinyin: "Yìbǎi yuán kěyǐ ma?",
      english: "Would 100 yuan work?",
      tip: "An example counteroffer, not a claim about a fair price. Compare a few sellers, choose your own limit, and negotiate only for something you might genuinely buy. No universal ‘offer 10 percent’ trick.",
    },
    {
      hanzi: "不用了，谢谢。",
      pinyin: "Bú yòng le, xièxie.",
      english: "No thanks, I’ll pass.",
      tip: "A polite exit is a skill. No insults, fake outrage, or obligation to buy. If pressured into an unsolicited tea/bar/art outing, decline and choose your own reviewed venue; agree prices first.",
    },
  ],
  question: "Where is a polite counteroffer appropriate?",
  options: [
    "A souvenir stall whose seller welcomes bargaining",
    "A fixed-price supermarket checkout",
    "Every restaurant bill and taxi meter",
  ],
  answer: 0,
  explanation:
    "Bargaining is situational, not a rule for all Chinese commerce. Respect fixed prices, confirm unit versus total price, and walk away calmly if the deal doesn’t work. Verify unfamiliar QR destinations, merchant names, and the payment amount before authorizing anything.",
});
// Learning order deliberately differs from travel order: short requests before full situations.
const learningOrder = [
  "basics",
  "arrival",
  "groom",
  "wall",
  "feast",
  "payment",
  "market",
  "palace",
  "train",
  "night",
  "ktv",
  "rescue",
];
missions.sort((a, b) => learningOrder.indexOf(a.id) - learningOrder.indexOf(b.id));
for (const mission of missions) {
  mission.matches = matchingFor(mission.id);
  mission.hype = hypeFor(mission.id);
}
export const fieldNotes = [
  {
    hanzi: "我要结婚了。",
    pinyin: "Wǒ yào jiéhūn le.",
    english: "I’m getting married. The groom’s one-line introduction.",
  },
  {
    hanzi: "牛肉 / 猪肉 / 鸡肉 / 羊肉",
    pinyin: "niú ròu / zhū ròu / jī ròu / yáng ròu",
    english: "Beef / pork / chicken / lamb",
  },
  {
    hanzi: "鱼 / 虾 / 花生 / 鸡蛋",
    pinyin: "yú / xiā / huāshēng / jīdàn",
    english: "Fish / shrimp / peanuts / eggs",
  },
  {
    hanzi: "米饭 / 面条 / 饺子 / 小笼包",
    pinyin: "mǐfàn / miàntiáo / jiǎozi / xiǎolóngbāo",
    english: "Rice / noodles / dumplings / soup dumplings",
  },
  {
    hanzi: "辣 / 不辣 / 素 / 凉",
    pinyin: "là / bú là / sù / liáng",
    english: "Spicy / not spicy / vegetarian / cold (ask about broth and ingredients)",
  },
  {
    hanzi: "一 二 三 四 五 六 七 八 九 十",
    pinyin: "yī èr sān sì wǔ liù qī bā jiǔ shí",
    english:
      "1–10. Before a measure word, two is usually 两 (liǎng). 十一 = 11; 二十 = 20; 一百 = 100.",
  },
  {
    hanzi: "左 / 右 / 一直走",
    pinyin: "zuǒ / yòu / yìzhí zǒu",
    english: "Left / right / go straight",
  },
  {
    hanzi: "入口 / 出口 / 禁止进入",
    pinyin: "rùkǒu / chūkǒu / jìnzhǐ jìnrù",
    english: "Entrance / exit / no entry",
  },
  {
    hanzi: "男 / 女 / 卫生间",
    pinyin: "nán / nǚ / wèishēngjiān",
    english: "Men / women / restroom",
  },
  {
    hanzi: "不要冰。 / 我要热水。",
    pinyin: "Bú yào bīng. / Wǒ yào rè shuǐ.",
    english: "No ice. / I’d like hot water.",
  },
  {
    hanzi: "我们有十九个人。",
    pinyin: "Wǒmen yǒu shíjiǔ ge rén.",
    english:
      "There are nineteen of us. Change the number for the actual headcount; count the groom, best man, and anyone joining separately.",
  },
  {
    hanzi: "我对花生过敏。",
    pinyin: "Wǒ duì huāshēng guòmǐn.",
    english:
      "I’m allergic to peanuts. Carry a professionally translated card for your own allergies; ask about cross-contact.",
  },
  {
    hanzi: "请带我们去这个地址。",
    pinyin: "Qǐng dài wǒmen qù zhège dìzhǐ.",
    english: "Please take us to this address. Show your hotel’s saved Chinese address.",
  },
  {
    hanzi: "可以打字吗？ / 请再说一遍。",
    pinyin: "Kěyǐ dǎzì ma? / Qǐng zài shuō yí biàn.",
    english: "Could you type it? / Please say that again.",
  },
  {
    hanzi: "请在这里停车。",
    pinyin: "Qǐng zài zhèlǐ tíngchē.",
    english: "Please stop here. Show the driver your destination in Chinese before setting off.",
  },
  {
    hanzi: "不用了，谢谢。",
    pinyin: "Bú yòng le, xièxie.",
    english: "No thanks. Useful for declining drinks, offers, and unnecessary extras.",
  },
];
export function checkAnswer(id: string, answer: unknown): boolean {
  const mission = missions.find((item) => item.id === id);
  return mission !== undefined && Number.isInteger(answer) && mission.answer === answer;
}
