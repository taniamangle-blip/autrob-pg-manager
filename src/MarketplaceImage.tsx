import './marketplace-image.css';

const demoTiles:Record<string,number>={
  'demo-market-bunk-bed':0,
  'demo-market-bedroom-pack':1,
  'demo-market-linen-pack':2,
  'demo-market-beds':3,
  'demo-market-mattress':4,
  'demo-market-cctv':5,
  'demo-market-water':6,
  'demo-market-laundry':7,
  'demo-market-plumbing':8,
  'demo-market-electrical':9,
  'demo-market-cleaning':10,
  'demo-market-ac':11,
  'demo-market-setup':12,
};

export default function MarketplaceImage({id,title,src}:{id:string;title:string;src?:string}){
  const tile=demoTiles[id];
  if(tile===undefined)return src?<img src={src} alt={title}/>:<div className="marketplace-image-empty" role="img" aria-label={`${title} image unavailable`}/>;
  const column=tile%4,row=Math.floor(tile/4);
  return <div className="marketplace-ai-photo" role="img" aria-label={`${title}, product photograph`}>
    <img src="/demo/marketplace-ai-contact-sheet.png" alt="" aria-hidden="true" style={{left:`${-105*column-2.5}%`,top:`${-105*row-2.5}%`}}/>
    <span className="marketplace-ai-label">AI product photo</span>
  </div>;
}
