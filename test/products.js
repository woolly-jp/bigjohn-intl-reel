// サイト(bigjohn-jeans.com)の /products.json と同じ形の仮データ。商品名の形はサイトの実例に合わせた
const img = (h, n) => Array.from({ length: n }, (_, i) => ({ src: `http://127.0.0.1:8765/img/${i === 0 ? 'product' : 'detail'}_placeholder.jpg?p=${h}${i}` }));
const P = (handle, title, vendor, tags, n, body, available) => ({ handle, title, vendor, product_type: 'MEN', tags, body_html: `<p>${body || title}.</p>`, variants: [{ title: '30', price: '33300', available: available !== false }], images: img(handle, n) });
module.exports = { products: [
  P('mj003-001', 'MJ003 (001) HEAVYWEIGHT DENIM JACKET', 'MEN / Jackets', ['JACKET'], 6, '14oz selvedge denim from Kojima. Heavyweight denim that breaks in over time and takes the shape of the wearer'),
  P('m1014rc-77', 'M1014RC (77) WILD DUCK CANVAS TROUSER', 'MEN/ WILD DUCK', ['CLASSIC', 'RELAX FIT', 'STRAIGHT'], 5),
  P('xx002-001', 'XX002 (001)『XXXX-EXTRA』MODEL SLIM STRAIGHT / ONE WASH', 'MEN / XX', ['STRAIGHT'], 4, 'Rigid selvedge denim that fades with wear and becomes your own'),
  P('m7014rc-77', 'M7014RC (77) WILD DUCK CANVAS SHORTS', 'MEN/ WILD DUCK', ['CLASSIC', 'RELAX FIT', 'SHORTS'], 6, 'A balance of workwear durability and lightweight comfort'),
  P('bjm113f-001', 'BJM113F/BJK113F (001) LOOSE STRAIGHT', 'MEN / BJ', ['LOOSE'], 4),
  P('ms003r-01eb', 'MS003R (01EB) Selvedge Chambray Shirt | Navy Emb', 'MEN / Denim Shirts', ['SHIRTS'], 7, 'Built with classic triple-stitched seams'),
  P('m102sl-aw', "M102SL (AW) SL VINTAGE 60's Classic Straight", 'MEN / Rare', ['STRAIGHT'], 2, '', false),
  P('m7014rc-57', 'M7014RC (57) WILD DUCK CANVAS SHORTS', 'MEN / WILD DUCK', 'CLASSIC, RELAX FIT, SHORTS', 2),
] };
