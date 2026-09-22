import { Request, Response } from 'express';
import logger from '../utils/logger';

interface State {
  name: string;
  lgas: string[];
}

const NIGERIAN_STATES: State[] = [
  { name: "Abia", lgas: ["Aba North","Aba South","Arochukwu","Bende","Ikwuano","Isiala Ngwa North","Isiala Ngwa South","Isuikwuato","Obi Ngwa","Ohafia","Osisioma","Umuahia North","Umuahia South","Ugwunagbo","Ukwa East","Ukwa West"] },
  { name: "Adamawa", lgas: ["Demsa","Fufure","Ganye","Gayuk","Girei","Gombi","Hong","Jada","Lamurde","Madagali","Maiha","Mayo Belwa","Michika","Mubi North","Mubi South","Numan","Shelleng","Song","Toungo","Yola North","Yola South"] },
  { name: "Akwa Ibom", lgas: ["Abak","Eastern Obolo","Eket","Esit Eket","Essien Udim","Etim Ekpo","Etinan","Ibeno","Ibesikpo Asutan","Ibiono Ibom","Ika","Ikono","Ikot Ekpene","Ini","Ituk Mbang","Mbo","Mkpat Enin","Nsit Atai","Nsit Ibom","Nsit Ubium","Obot Akara","Okobo","Onna","Oron","Oruk Anam","Ukanafun","Uruan","Urue Offong/Oruko","Uyo"] },
  { name: "Anambra", lgas: ["Aguata","Anambra East","Anambra West","Anaocha","Awka North","Awka South","Ayamelum","Dunukofia","Ekwusigo","Idemili North","Idemili South","Ihiala","Njikoka","Nnewi North","Nnewi South","Ogbaru","Onitsha North","Onitsha South","Orumba North","Orumba South","Oyi"] },
  { name: "Bauchi", lgas: ["Alkaleri","Bauchi","Bogoro","Dass","Darazo","Gamawa","Ganjuwa","Giade","Itas/Gadau","Jama'are","Katagum","Kirfi","Misau","Ningi","Shira","Tafawa Balewa","Toro","Warji","Zaki"] },
  { name: "Bayelsa", lgas: ["Brass","Ekeremor","Kolokuma/Opokuma","Nembe","Ogbia","Sagbama","Southern Ijaw","Yenagoa"] },
  { name: "Benue", lgas: ["Agatu","Apa","Buruku","Gboko","Guma","Gwer East","Gwer West","Katsina-Ala","Konshisha","Kwande","Logo","Makurdi","Otukpo","Tarka","Ukum","Ushongo","Vandeikya"] },
  { name: "Borno", lgas: ["Abadam","Askira/Uba","Bama","Bayo","Biu","Chibok","Damboa","Dikwa","Gubio","Guzamala","Gwoza","Jere","Kaga","Kala/Balge","Konduga","Kukawa","Kwaya Kusar","Magumeri","Marte","Monguno","Ngala","Nganzai","Shani"] },
  { name: "Cross River", lgas: ["Abi","Akamkpa","Akpabuyo","Bakassi","Bekwarra","Biase","Boki","Calabar Municipal","Calabar South","Etung","Ikom","Obanliku","Obudu","Odukpani","Ogoja","Yakurr","Yala"] },
  { name: "Delta", lgas: ["Aniocha North","Aniocha South","Bomadi","Burutu","Ethiope East","Ethiope West","Ika North East","Ika South","Isoko North","Isoko South","Ndokwa East","Ndokwa West","Okpe","Oshimili North","Oshimili South","Patani","Sapele","Udu","Ughelli North","Ughelli South","Ukwuani","Uvwie","Warri North","Warri South","Warri South West"] },
  { name: "Ebonyi", lgas: ["Abakaliki","Afikpo North","Afikpo South","Ebonyi","Ezza North","Ezza South","Ikwo","Ishielu","Ivo","Izzi","Ohaozara","Ohaukwu","Onicha"] },
  { name: "Edo", lgas: ["Akoko-Edo","Egor","Esan Central","Esan North-East","Esan South-East","Esan West","Etsako Central","Etsako East","Etsako West","Ikpoba-Okha","Oredo","Orhionmwon","Ovia North-East","Ovia South-West","Owan East","Owan West","Uhunmwonde"] },
  { name: "Ekiti", lgas: ["Ado Ekiti","Efon","Ekiti East","Ekiti South-West","Ekiti West","Emure","Gbonyin","Ido Osi","Ijero","Ikere","Ikole","Ilejemeje","Irepodun/Ifelodun","Ise/Orun","Moba","Oye"] },
  { name: "Enugu", lgas: ["Aninri","Awgu","Enugu East","Enugu North","Enugu South","Ezeagu","Igbo-Etiti","Igbo-Eze North","Igbo-Eze South","Isi Uzo","Nkanu East","Nkanu West","Nsukka","Oji River","Udenu","Udi","Uzo-Uwani"] },
  { name: "FCT", lgas: ["Abaji","Abuja Municipal","Gwagwalada","Kuje","Kwali"] },
  { name: "Gombe", lgas: ["Akko","Balanga","Billiri","Dukku","Funakaye","Gombe","Kaltungo","Kwami","Nafada","Shongom","Yamaltu/Deba"] },
  { name: "Imo", lgas: ["Aboh Mbaise","Ahiazu Mbaise","Ehime Mbano","Ezinihitte Mbaise","Ideato North","Ideato South","Ihitte/Uboma","Ikeduru","Isiala Mbano","Isu","Mbaitoli","Ngor Okpala","Njaba","Nkwerre","Nwangele","Obowo","Oguta","Ohaji/Egbema","Okigwe","Onuimo","Orlu","Orsu","Oru East","Oru West","Owerri Municipal","Owerri North","Owerri West","Unuimo"] },
  { name: "Jigawa", lgas: ["Auyo","Babura","Biriniwa","Birnin Kudu","Buji","Dutse","Garki","Gumel","Guri","Gwaram","Gwiwa","Hadejia","Jahun","Kafin Hausa","Kazaure","Kiri Kasama","Kiyawa","Maigatari","Malam Madori","Miga","Ringim","Roni","Sule Tankarkar","Taura","Yankwashi"] },
  { name: "Kaduna", lgas: ["Birnin Gwari","Chikun","Giwa","Igabi","Ikara","Jaba","Jema'a","Kachia","Kaduna North","Kaduna South","Kagarko","Kajuru","Kauru","Kubau","Kudan","Lere","Makarfi","Sabon Gari","Sanga","Zaria"] },
  { name: "Kano", lgas: ["Ajingi","Albasu","Bagwai","Bebeji","Bichi","Bunkure","Dala","Dambatta","Dawakin Kudu","Dawakin Tofa","Doguwa","Fagge","Gabasawa","Garko","Garun Mallam","Gaya","Gezawa","Gwale","Gwarzo","Kabo","Kano Municipal","Karaye","Kibiya","Kiru","Kumbotso","Kunchi","Kura","Madobi","Makoda","Minjibir","Nasarawa","Rano","Rimin Gado","Rogo","Shanono","Sumaila","Takai","Taraure","Tofa","Tsanyawa","Tudun Wada","Ungogo","Warawa","Wudil"] },
  { name: "Katsina", lgas: ["Batagarawa","Batsari","Baure","Bindawa","Charanchi","Dan Musa","Dandume","Danja","Daura","Dutsin-Ma","Faskari","Funtua","Ingawa","Jibia","Kafur","Kaita","Kankara","Kankia","Katsina","Kurfi","Kusada","Mai'Adua","Malumfashi","Mani","Mashi","Matazu","Musawa","Rimi","Sabuwa","Safana","Sandamu","Zango"] },
  { name: "Kebbi", lgas: ["Aleiro","Arewa Dandi","Argungu","Augie","Bagudo","Bunza","Dandi","Fakai","Gwandu","Jega","Kalgo","Koko/Besse","Maiyama","Ngaski","Sakaba","Shanga","Suru","Wasagu/Danko","Yauri","Zuru"] },
  { name: "Kogi", lgas: ["Adavi","Ajaokuta","Ankpa","Bassa","Dekina","Ibaji","Idah","Igalamela-Odolu","Ijumu","Kabba/Bunu","Kogi","Lokoja","Mopa-Muro","Ofu","Ogori/Magongo","Okehi","Okene","Olamaboro","Omala","Yagba East","Yagba West"] },
  { name: "Kwara", lgas: ["Asa","Baruten","Edu","Ekiti","Ifelodun","Ilorin East","Ilorin West","Irepodun","Isin","Kaiama","Moro","Offa","Oke-Ero","Oyun","Pategi"] },
  { name: "Lagos", lgas: ["Agege","Ajeromi-Ifelodun","Alimosho","Amuwo-Odofin","Apapa","Badagry","Epe","Eti-Osa","Ibeju-Lekki","Ifako-Ijaiye","Ikeja","Ikorodu","Kosofe","Lagos Island","Lagos Mainland","Mushin","Ojo","Oshodi-Isolo","Somolu","Surulere"] },
  { name: "Nasarawa", lgas: ["Akwanga","Awe","Doma","Karu","Keana","Keffi","Kokona","Lafia","Nasarawa","Nasarawa-Eggon","Obi","Toto","Wamba"] },
  { name: "Niger", lgas: ["Agaie","Agwara","Bida","Borgu","Bosso","Chanchaga","Edati","Gbako","Gurara","Katcha","Kontagora","Lapai","Lavun","Magama","Mariga","Mashegu","Mokwa","Munya","Paikoro","Rafi","Rijau","Shiroro","Suleja","Tafa","Wushishi"] },
  { name: "Ogun", lgas: ["Abeokuta North","Abeokuta South","Ado-Odo/Ota","Ewekoro","Ifo","Ijebu East","Ijebu North","Ijebu North-East","Ijebu-Ode","Ikenne","Imeko Afon","Ipokia","Obafemi Owode","Odeda","Odogbolu","Ogun Waterside","Remo North","Sagamu","Yewa North","Yewa South"] },
  { name: "Ondo", lgas: ["Akoko North-East","Akoko North-West","Akoko South-East","Akoko South-West","Akure North","Akure South","Ese Odo","Idanre","Ifedore","Ilaje","Ile-Oluji/Okeigbodo","Irele","Ondo East","Ondo West","Ose","Owo"] },
  { name: "Osun", lgas: ["Atakunmosa East","Atakunmosa West","Boluwaduro","Boripe","Ede North","Ede South","Egbedore","Ejigbo","Ife Central","Ife East","Ife North","Ife South","Ifedayo","Ifelodun","Ila","Ilesa East","Ilesa West","Irepodun","Iwo","Obokun","Odo-Otin","Ola-Oluwa","Olorunda","Oriade","Orolu","Osogbo"] },
  { name: "Oyo", lgas: ["Afijio","Akinyele","Atiba","Atigbo","Egbeda","Ibadan North","Ibadan North-East","Ibadan North-West","Ibadan South-East","Ibadan South-West","Ibarapa Central","Ibarapa East","Ibarapa North","Ido","Irepo","Kajola","Lagelu","Ogbomosho North","Ogbomosho South","Ogo Oluwa","Olorunsogo","Oluyole","Ona Ara","Oriire","Oyo East","Oyo West","Saki East","Saki West","Surulere"] },
  { name: "Plateau", lgas: ["Barkin Ladi","Bassa","Bokkos","Jos East","Jos North","Jos South","Kanam","Kanke","Langtang North","Langtang South","Mangu","Mikang","Pankshin","Qua'an Pan","Riyom","Shendam","Wase"] },
  { name: "Rivers", lgas: ["Abua/Odual","Ahoada East","Ahoada West","Akuku-Toru","Andoni","Asari-Toru","Bonny","Degema","Eleme","Emohua","Gokana","Ikwerre","Khana","Obio/Akpor","Ogba/Egbema/Ndoni","Ogu/Bolo","Okrika","Omuma","Opobo/Nkoro","Port Harcourt","Tai"] },
  { name: "Sokoto", lgas: ["Binji","Bodinga","Dange Shuni","Gada","Goronyo","Gudu","Gwadabawa","Illela","Isa","Kebbe","Kware","Rabah","Sabon Birni","Shagari","Silame","Sokoto North","Sokoto South","Tambuwal","Tangaza","Tureta","Wamako","Wurno","Yabo"] },
  { name: "Taraba", lgas: ["Ardo Kola","Bali","Donga","Gashaka","Gassol","Ibi","Jalingo","Karim Lamido","Kurmi","Sardauna","Takum","Ussa","Wukari","Yorro","Zing"] },
  { name: "Yobe", lgas: ["Bade","Bursari","Damaturu","Fika","Fune","Geidam","Gujba","Gulani","Jakusko","Karasuwa","Machina","Nangere","Nguru","Potiskum","Tarmuwa","Yunusari","Yusufari"] },
  { name: "Zamfara", lgas: ["Anka","Bakura","Birnin Magaji/Kiyaw","Bukkuyum","Gummi","Gusau","Isah","Kaura Namoda","Maradun","Maru","Shinkafi","Talata Mafara","Tsafe","Zurmi"] },
];

export const getStates = async (_req: Request, res: Response) => {
  try {
    const states = NIGERIAN_STATES.map((s) => s.name);
    res.status(200).json({ states });
  } catch (err: any) {
    (_req.log || logger).error({ err }, 'locations.get_states_failed');
    res.status(500).json({ error: 'Failed to fetch states' });
  }
};

export const getLgas = async (req: Request, res: Response) => {
  try {
    const { state } = req.query;
    if (!state || typeof state !== 'string') {
      return res.status(400).json({ error: 'state query parameter is required' });
    }
    const found = NIGERIAN_STATES.find((s) => s.name === state);
    if (!found) {
      return res.status(404).json({ error: 'State not found' });
    }
    res.status(200).json({ lgas: found.lgas });
  } catch (err: any) {
    (req.log || logger).error({ err, query: req.query }, 'locations.get_lgas_failed');
    res.status(500).json({ error: 'Failed to fetch LGAs' });
  }
};
