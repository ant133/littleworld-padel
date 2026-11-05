// Bahasa Indonesia: commentary pools (read through i18n.list('commentary.<pool>', english) in 18_commentary.js).
// Same tokens as the English pool ({P} {T} {O} {N} {S} {FL} {PL}); no gendered pronouns. Padel terms stay English; kaca = glass, dinding = wall.
(function (HPO) {
  'use strict';
  HPO.mod.i18n.register('id', {
    // ---- shots
    'commentary.bandeja': [
      'Bandeja sempurna untuk menjaga kendali di net!', '{P} melayangkan bandeja yang indah dan tetap menguasai net.', 'Bandeja textbook dari {P}, posisi net tetap aman.',
      '{P} dengan bandeja yang dalam dan aman, masih memegang kendali di depan.', 'Bandeja yang manis, {P} penguasa net.', 'Bandeja rapi dari {P}, lawan belum bisa berbuat apa-apa.'],
    'commentary.chiquitaForce': [
      'Chiquita brilian memaksa lawan mundur!', 'Chiquita {P}, rendah dan lembut, dan {O} terdorong ke belakang!', 'Chiquita itu menyeret {O} dari net, mau tidak mau mereka harus bertahan.',
      'Chiquita yang lezat dari {P}, {O} cuma bisa membalas dengan lob.', 'Chiquita ke arah kaki! {O} langsung terdesak.', 'Chiquita dari {P} bikin {O} mundur teratur.'],
    'commentary.lobDefPressure': [
      'Lob bertahan yang luar biasa!', '{P} mengangkat lob entah dari mana, dan mereka kembali ke dalam poin!', 'Lob bertahan yang hebat di bawah tekanan dari {P}!',
      '{P} sedang kewalahan, tapi lob itu memberi waktu yang sangat longgar.', 'Dari posisi sulit, {P} melob dan lolos dari bahaya.', 'Terjepit, tapi {P} menyelamatkan diri dengan lob yang cantik.'],
    'commentary.doubleGlass': [
      'Penyelamatan dari dua pantulan kaca yang spektakuler!', '{P} membaca pantulan ganda dan mengembalikannya, kelas sekali.', 'Kena kaca samping, kena kaca belakang, dan {P} masih ada di sana!',
      'Dua dinding, bukan masalah buat {P}!', 'Permainan dinding yang luar biasa, {P} mengikuti bola sepanjang kaca.', '{P} sabar menunggu bola keluar dari dua kaca, lalu mengembalikannya.'],
    'commentary.tripleGlass': [
      'Tiga dinding! {P} menolak kehilangan bola itu!', 'Bola sudah keliling kaca dan {P} masih bisa mengembalikannya!', 'Tiga pantulan dan {P} sudah menunggu. Luar biasa!',
      'Bola itu mengelilingi seluruh kandang dan {P} berhasil menemukannya. Hebat!', '{P} mengejar bola dari kaca ke kaca ke kaca, pantang menyerah!'],
    'commentary.smashBack': [
      'Smash itu langsung memantul balik dari kaca!', 'Smash menghantam kaca dan terbang kembali melewati net!', 'Smash kena dinding dan langsung balik, {P} harus memukul lagi!',
      'Luar biasa, smash memantul dari kaca dan kembali melewati net!', 'Dari kaca dan balik lagi! {P} dapat kesempatan kedua untuk smash.', 'Smash itu pulang lewat kaca, {P} harus siap lagi!'],
    'commentary.dejada': [
      'Dejada halus dari {P}, bolanya mati tepat setelah net.', '{P} menjatuhkan bola pelan di atas net, sentuhan yang indah!', 'Dejada yang lembut, dan {O} tertangkap diam di tempat.',
      'Dejada seringan bulu dari {P}.', 'Sentuhan lembut {P}, dejada yang bikin {O} cuma bisa menonton.'],
    'commentary.vibora': [
      'Vibora yang menggigit dari {P}!', '{P} mencambuk vibora dengan banyak putaran samping.', 'Vibora dari {P} itu melengkung menjauh dari {O}.',
      'Vibora yang licik, bola menukik dan melompat dari kaca.', 'Vibora tajam, {O} kesulitan membaca arah bolanya.'],
    'commentary.smashPower': [
      'Smash monster dari {P}!', '{P} melepas overhead yang dahsyat!', 'Tenaga luar biasa di smash itu!', '{P} menghantam smash itu seperti roket.', 'Duar! Smash {P} melesat cepat sekali.'],
    'commentary.wallStreak': [
      'Rally ini bergulir dari dinding ke dinding!', 'Semua bola kembali dari kaca di sini.', 'Tidak ada yang bisa menuntaskan, kaca terus mengembalikan bolanya.',
      'Dinding demi dinding demi dinding, inilah padel di level terbaiknya.', 'Bola terus berputar di sekitar kaca, siapa yang menyerah duluan?'],
    'commentary.anticipate': [
      '{P} bersiap untuk smash...', 'Overhead datang dari {P}!', '{P} mengincar pukulan besar.', 'Bola tinggi, dan {P} siap menyerangnya.', '{P} sudah di posisi, sepertinya smash akan datang.'],
    'commentary.rallyN': [
      'Sudah {N} pukulan!', '{N} pukulan dan terus berlanjut, tidak ada yang mau mengalah.', 'Stamina luar biasa, {N} pukulan dalam rally ini!', 'Sekarang sudah {N} pukulan, pertarungan yang seru.',
      'Masih berlanjut, {N} pukulan dan penonton berdiri.'],
    // ---- points
    'commentary.ace': [
      'Ace! {P} menembus mereka dengan serve.', 'Tak terbalas! Ace dari {P}.', 'Ace dari {P}, bola bahkan tidak tersentuh.', 'Ace bersih dari {P}!', 'Serve {P} melesat dan lawan cuma bisa melihat. Ace!'],
    'commentary.doubleFault': [
      'Double fault dari {P}, hadiah untuk {O}.', '{P} double fault, tekanan mulai terasa.', 'Dua serve, dua fault. Poin untuk {O}.', 'Aduh, double fault dari {P}.', 'Serve kedua {P} juga gagal, double fault.'],
    'commentary.smashWinner': [
      '{P} menghabisinya dengan smash, tidak ada jawaban!', 'Winner overhead dari {P}, menggelegar!', 'Smash winner dan {T} mengambil poin.', 'Boom! {P} menuntaskannya.', 'Smash {P} tak terkejar, poin untuk {T}!'],
    'commentary.wallWinner': [
      '{P} memenangkan poin lewat kaca, poin yang luar biasa!', 'Bola memantul dari kaca dan {O} tidak bisa menjangkaunya.', 'Pemanfaatan dinding yang indah dari {P} untuk menutup poin.',
      'Bola keluar dari kaca belakang dengan sudut tajam dan hilang, poin untuk {T}.', 'Kaca membantu {P}, dan {O} cuma bisa melihat bola lewat.'],
    'commentary.lobWinner': [
      '{P} melob mereka! Melewati kepala dan di luar jangkauan.', 'Lob sempurna dari {P}, {O} tidak punya peluang.', 'Lob itu jatuh di belakang {O}. Poin untuk {T}.',
      'Melewati atas! {P} memenangkan poin dengan lob.', 'Lob yang manis dari {P}, {O} berbalik tapi sudah terlambat.'],
    'commentary.volleyWinner': [
      'Volley tajam dari {P} menutup poin.', '{P} menusuk volley ke sisi lapangan yang kosong.', 'Tangan yang hebat di net, {P} menuntaskannya.', 'Volley winner yang rapi dari {P}.',
      'Volley cepat dari {P}, lawan tak sempat bereaksi.'],
    'commentary.winner': [
      '{P} menemukan winner.', 'Winner bersih dari {P}.', '{T} mengambil poin dengan penutup yang bersih.', 'Terlalu bagus untuk {O}.', '{O} tidak punya jawaban untuk itu.', 'Pukulan penutup yang rapi dari {P}.'],
    'commentary.unforced': [
      'Unforced error dari {P}.', '{P} memberikannya begitu saja.', 'Pukulan longgar dari {P}, dan {T} akan menerimanya.', 'Kesempatan di depan mata, tapi {P} gagal.', 'Bola mudah, tapi {P} salah pukul.'],
    'commentary.forced': [
      '{O} memaksa error dari {P}.', 'Tekanan terasa, {P} tidak bisa menjaga bola tetap di dalam.', '{P} terulur di situ dan itu mengorbankan poin.', 'Tekanan bagus dari {O} memancing kesalahan.',
      '{P} terdesak dan bolanya keluar.'],
    'commentary.longRally': [
      'Rally yang luar biasa! {N} pukulan sebelum {T} akhirnya menang.', 'Rally epik {N} pukulan jadi milik {T}.', '{T} memenangkan maraton, {N} pukulan panjangnya!',
      'Pertarungan {N} pukulan itu berakhir untuk {T}.', 'Capek menonton saja! {N} pukulan, dan {T} yang menang.'],
    'commentary.savedMatch': [
      '{T} menyelamatkan match point!', 'Mereka masih hidup! Match point diselamatkan {T}.', 'Besar! {T} menahan match point.', '{T} menolak menyerah, match point diselamatkan.'],
    'commentary.savedSet': [
      '{T} menyelamatkan set point.', 'Set point diselamatkan {T}, set berlanjut.', '{T} bertahan, set point hilang.', 'Poin besar, {T} menjaga set tetap hidup.'],
    'commentary.savedBreak': [
      '{T} menyelamatkan break point.', 'Break point diselamatkan, {T} tetap unggul.', 'Serve yang hebat di bawah tekanan dari {T}, tidak ada break.', '{T} tetap tenang dan menghapus break point.'],
    'commentary.goldenWon': [
      '{T} memenangkan golden point!', 'Golden point jatuh ke {T}!', 'Dan {T} mengambil game lewat golden point!', 'Golden point selesai, {T} berhasil.'],
    'commentary.retrieval': [
      '{P} mengejarnya sampai ke luar lapangan dan mengembalikannya!', 'Bola keluar dari kandang, dan {P} mengejarnya!', '{P} mengambil bola dari luar dan mengembalikannya, usaha yang luar biasa.',
      'Keluar lewat pintu, {P} berlari, dan poinnya masih hidup!'],
    'commentary.timeout': [
      'Timeout diminta, waktunya bicara.', 'Timeout! Pelatih punya beberapa kata.', 'Mereka menghentikan waktu untuk timeout dan menyusun ulang.', 'Timeout, kesempatan mengatur ulang rencana.'],
    // ---- serve
    'commentary.faultMesh': [
      'Serve menyentuh pagar, itu fault.', 'Mesh fault, serve mengenai pagar setelah memantul.', 'Bola kena mesh, fault.', 'Kena pagar, dan itu fault.'],
    'commentary.faultNet': [
      'Masuk net, fault.', 'Serve tidak melewati net.', 'Net fault dari serve.', 'Serve yang ragu-ragu dan masuk net.'],
    'commentary.letNet': [
      'Net cord di serve, let!', 'Kena pita net lalu jatuh masuk. Let, serve diulang.', 'Let! Serve menggelitik net.', 'Net cord di situ, serve akan diulang.'],
    // ---- score situation
    'commentary.goldenPoint': [
      'Golden point! Semuanya dipertaruhkan!', 'Ini golden point, poin berikutnya menentukan game!', 'Golden point, satu poin terakhir.', 'Golden point, seluruh game ditentukan di sini.'],
    'commentary.goldenCombo': [
      'Golden point, dan ini {FL} untuk {T}!', '{FL} untuk {T}, dan ini golden point!', 'Semuanya dipertaruhkan: golden point dan {FL} untuk {T}.', 'Golden point, {FL}! {T} bisa mengakhirinya di sini.'],
    'commentary.matchPoint': [
      'Match point untuk {T}!', '{T} tinggal satu poin lagi untuk menang.', 'Match point! Bisakah {T} menutupnya?', 'Ini bisa jadi akhirnya, match point untuk {T}.'],
    'commentary.setPoint': [
      'Set point untuk {T}.', '{T} punya set point.', 'Set point! {T} tinggal satu poin dari set ini.', 'Kesempatan merebut set untuk {T}.'],
    'commentary.breakPoint': [
      'Break point untuk {T}, bisakah mereka mengambilnya?', '{T} punya break point.', 'Break point! {T} mencium celah.', 'Peluang break untuk {T}, poin yang besar.'],
    'commentary.tiebreak': [
      'Waktunya tie-break! Yang duluan sampai tujuh menang.', 'Kita masuk tie-break!', 'Skor imbang dan kita ke tie-break.', 'Tie-break! Setiap poin menentukan sekarang.'],
    'commentary.streak': [
      '{T} sudah memenangkan {N} poin beruntun!', '{N} poin berturut-turut untuk {T}.', '{T} sedang panas, {N} poin beruntun.', 'Momentum ada di {T}: sudah {N} poin berturut-turut.'],
    'commentary.gameStreak': [
      '{T} sudah memenangkan {N} game beruntun!', '{N} game berturut-turut untuk {T}.', 'Momentum sepenuhnya milik {T}, {N} game beruntun.', '{T} telah mengambil {N} game langsung.'],
    'commentary.breakOfServe': [
      'Itu dia break! {T} mematahkan serve.', 'Break of serve untuk {T}!', '{T} menembus, game servis hilang.', 'Break yang krusial untuk {T}.'],
    'commentary.hold': [
      '{T} hold serve.', 'Hold yang nyaman untuk {T}.', 'Game servis untuk {T}.', '{T} hold dan lanjut.'],
    'commentary.gameWon': [
      'Game {T}, {S}.', '{T} mengambil game, {S}.', 'Itu game untuk {T}, {S}.', '{S} setelah game itu untuk {T}.'],
    'commentary.setWon': [
      '{T} mengambil set, {S}!', 'Set untuk {T}, {S}.', 'Dan itu set untuk {T}, {S}.', '{T} menutup set {S}.'],
    'commentary.matchWon': [
      'Game, set, dan match untuk {T}!', 'Selesai! {T} memenangkan pertandingan Littleworld Jakarta Padel Cup, {S}.', 'Kemenangan untuk {T}, {S}!', '{T} pemenangnya, {S}. Pertandingan yang luar biasa!'],
    'commentary.fatigue': [
      '{P} mulai merasakan panasnya.', '{P} sudah terengah-engah.', 'Kaki {P} mulai goyah.', 'Kelelahan mulai terlihat pada {P}.'],
    'commentary.formationAttack': [
      'Mereka berdua maju ke net.', '{T} maju berpasangan, merebut net.', '{T} maju bersama-sama.', 'Kedua pemain {T} sudah di net sekarang.'],
    'commentary.formationDefend': [
      '{T} mundur untuk menjaga kaca.', 'Keduanya mundur, siap memanfaatkan dinding.', '{T} melepas net dan bertahan di dalam.', 'Pasangan {T} terdorong sampai dinding belakang.'],
    'commentary.coach': [
      '{T} ganti taktik: {PL}.', 'Perubahan taktik dari {T}, {PL}.', 'Rencana baru untuk {T}: {PL}.', '{T} menyesuaikan permainan, {PL}.'],
    'commentary.changeoverGame': [
      'Pemain bertukar sisi dan minum sebentar.', 'Changeover, saatnya mengelap keringat dan bicara taktik.', 'Mereka bertukar sisi sekarang.', 'Jeda singkat saat kedua tim bertukar sisi.'],
    'commentary.changeoverSet': [
      'Set break: saatnya menyusun ulang dan mengatur ulang.', 'Para pemain istirahat lebih lama di antara set.', 'Napas sejenak antar set, pelatih pasti punya banyak yang disampaikan.',
      'Set break, kesempatan untuk memulihkan tenaga.'],
    'commentary.challengeStands': [
      'Eagle Eye... keputusan bertahan!', 'Eagle Eye mengonfirmasi, keputusan tetap.', 'Eagle Eye sudah bicara: keputusan awal benar.', 'Replay menunjukkan keputusannya benar, tetap berlaku.'],
    'commentary.challengeOver': [
      'Eagle Eye... keputusan dibatalkan!', 'Eagle Eye membatalkannya! Bolanya ternyata {S}.', 'Challenge berpihak pada mereka, keputusan dibatalkan!', 'Dibatalkan! Eagle Eye menunjukkan bolanya {S}.'],
    // ---- phases
    'commentary.phIntro': [
      'Selamat datang di Littleworld Jakarta Padel Cup!', 'Halo semuanya, dan selamat datang di Littleworld Jakarta Padel Cup.',
      'Kita siaran langsung dari Littleworld Jakarta Padel Cup, kacanya berkilau dan penonton sudah siap.', 'Halo dan selamat datang, kita punya pertandingan ganda yang seru.'],
    'commentary.phWalkon': [
      'Dan inilah para pemain memasuki lapangan.', 'Para pemain berjalan keluar disambut hangat.', 'Itu mereka, berjalan masuk ke lapangan.', 'Kedua tim melangkah ke lapangan.'],
    'commentary.phIntros': [
      'Hari ini {T} melawan {O}.', 'Mari berkenalan dengan para pemain: {T} versus {O}.', '{T} menghadapi {O} di laga ini.', 'Ini {T} versus {O}, duel yang menarik.'],
    'commentary.phToss': [
      'Coin toss menentukan siapa yang serve duluan.', 'Coin toss selesai, kita hampir siap.', 'Koin sudah dilempar, pilihan sudah dibuat.', 'Sisi lapangan dan serve ditentukan lewat coin toss.'],
    'commentary.phWarmup': [
      'Para pemain memanaskan pergelangan tangan dan dindingnya.', 'Beberapa menit untuk menemukan ritme di permukaan ini.', 'Waktunya warm-up, mencari feel dengan kaca.',
      'Mereka menguji pantulan kaca sebelum poin pertama.'],
    'commentary.phPlay': [
      'Kita mulai! {P} serve duluan.', 'Pertandingan dimulai, {P} yang akan serve.', 'Play! {P} maju untuk serve.', 'Dan pertandingan pun dimulai, {P} yang serve.'],
    'commentary.phHandshake': [
      'Salaman di net, sportivitas yang bagus.', 'Kedua tim bersalaman setelah pertandingan yang baik.', 'Saling hormat saat mereka bersalaman.', 'Jabat tangan hangat di net.'],
    'commentary.phCeremony': [
      'Sekarang upacara trofi.', 'Saatnya sang juara mengangkat trofi!', 'Trofi diserahkan kepada pemenang.', 'Konfeti dan waktunya trofi di Littleworld Jakarta Padel Cup.'],
    'commentary.phMatchEnd': [
      'Dan itu pertandingannya!', 'Poin terakhir sudah dimainkan, pertandingan yang luar biasa.', 'Selesai, pertandingan sudah ditentukan.', 'Semuanya sudah berakhir.'],
    // ---- interjections (prepended to a line), "salim" (15-all) joke
    'commentary.inter2': ['Pukulan hebat!', 'Wah, spesial sekali!', 'Wow!', 'Cantik!', 'Fantastis!'],
    'commentary.inter3': ['Luar biasa!', 'Tak bisa dipercaya!', 'Penonton berdiri!', 'Ya ampun!', 'Benar-benar sensasional!'],
    'commentary.salim': [
      'Salim! Sama lima, bukan salim tangan ya.', 'Lima belas sama, alias salim. Jangan lupa hormat sama lawan.', 'Salim lagi! Skor kembar, tinggal siapa yang berani maju duluan.',
      'Sama lima, salim! Kedua tim saling menghormati di lapangan.', 'Salim, kata orang kita. Sama lima, dan masih sama kuat.', 'Salim dulu sebelum lanjut. Lima belas sama, pertandingan masih terbuka!'],
    // ---- coach plan phrases (slot into commentary.coach)
    'going aggressive': 'bermain agresif',
    'playing safe and patient': 'bermain aman dan sabar',
    'taking control of the net': 'menguasai net',
    'sitting back in defence': 'mundur dan bertahan',
    'attacking the middle': 'menyerang bagian tengah',
    'using the glass': 'memanfaatkan kaca',
    'rushing the net': 'merangsek ke net',
    'targeting one opponent': 'mengincar satu lawan',
    'with more chiquitas': 'memperbanyak chiquita',
    'looking for more smashes': 'mencari lebih banyak smash',
    'back to a balanced game': 'kembali ke permainan seimbang'
  }, 'id-ID');
})(HPO);
