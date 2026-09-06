import * as T from 'three';

function noise(x:number,y:number) {
  let n=Math.imul(x+311,374761393)^Math.imul(y+719,668265263);
  n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967295;
}

function heightTexture(sample:(x:number,y:number)=>number,size=256) {
  const bytes=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const value=Math.round(T.MathUtils.clamp(sample(x,y),0,1)*255);
    const offset=(y*size+x)*4;
    bytes[offset]=bytes[offset+1]=bytes[offset+2]=value;
    bytes[offset+3]=255;
  }
  const texture=new T.DataTexture(bytes,size,size,T.RGBAFormat);
  texture.wrapS=texture.wrapT=T.RepeatWrapping;
  texture.magFilter=T.LinearFilter;
  texture.minFilter=T.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;
  texture.anisotropy=8;
  texture.needsUpdate=true;
  return texture;
}

/** Small, repeatable surface variation; geometry remains the source of shape. */
export function pianoSurfaces() {
  const fibre=heightTexture((x,y)=>.5+.17*Math.sin(x*Math.PI/8+Math.sin(y*Math.PI/32)*2)
    +.13*Math.sin((x+y)*Math.PI/4)+.2*(noise(x,y)-.5));
  const leather=heightTexture((x,y)=> {
    const gx=x/16,gy=y/16,cx=Math.floor(gx),cy=Math.floor(gy);
    let nearest=Infinity,second=Infinity;
    for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++) {
      const hx=(cx+i+16)%16,hy=(cy+j+16)%16;
      const d=Math.hypot(gx-(cx+i+noise(hx,hy)),gy-(cy+j+noise(hx+29,hy+71)));
      if(d<nearest){second=nearest;nearest=d;}else if(d<second)second=d;
    }
    const seam=T.MathUtils.smoothstep(second-nearest,.018,.11);
    return .28+.43*seam+.06*(noise(x,y)-.5);
  });
  const cast=heightTexture((x,y)=>.5+.38*(noise(x,y)-.5));
  const brushed=heightTexture((x,y)=>.5+.3*(noise(x,0)-.5)+.04*(noise(x,y)-.5));
  return {fibre,leather,cast,brushed};
}

export function feltMaterial(bump:T.Texture,color='#e9dfcc') {
  return new T.MeshPhysicalMaterial({color,roughness:.97,bumpMap:bump,bumpScale:.00014,
    sheen:1,sheenColor:'#f7e9ce',sheenRoughness:.92});
}

export function leatherMaterial(bump:T.Texture,color='#ae8a62') {
  return new T.MeshPhysicalMaterial({color,roughness:.61,bumpMap:bump,bumpScale:.00022,
    sheen:.22,sheenColor:color,sheenRoughness:.75});
}
