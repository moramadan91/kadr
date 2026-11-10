// Shader transitions. Each one is a GLSL body `vec4 tr(vec2 u)` that mixes layer A (the outgoing clip,
// held on its last frame) and layer B (the incoming clip) at progress p (0..1). Both layers are full
// frames with alpha; sampling outside 0..1 mirrors, so zooms and pushes never show empty edges.
// The preview runs them every frame; the export renders the same frames to PNGs (see app.js).
(function (root) {
  const HEAD = `precision highp float;
varying vec2 uv0;
uniform sampler2D tA, tB;
uniform float p;
uniform vec2 R;
#define PI 3.14159265
float AS(){return R.x/R.y;}
vec2 mir(vec2 u){vec2 m=mod(u,2.);return mix(m,2.-m,step(1.,m));}
vec4 TA(vec2 u){return texture2D(tA,mir(u));}
vec4 TB(vec2 u){return texture2D(tB,mir(u));}
bool inb(vec2 u){return u.x>=0.&&u.x<=1.&&u.y>=0.&&u.y<=1.;}
float io(float x){return x<.5?4.*x*x*x:1.-pow(2.-2.*x,3.)*.5;}
float ei(float x){return x*x*x;}
float eo(float x){float y=1.-x;return 1.-y*y*y;}
float bk(float x){float c=1.70158;float y=x-1.;return 1.+(c+1.)*y*y*y+c*y*y;}
float h1(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(h1(i),h1(i+vec2(1.,0.)),f.x),mix(h1(i+vec2(0.,1.)),h1(i+1.),f.x),f.y);}
float fbm(vec2 q){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(q);q*=2.03;a*=.5;}return s;}
vec2 rot(vec2 q,float a){float c=cos(a),s=sin(a);return vec2(c*q.x-s*q.y,s*q.x+c*q.y);}
vec2 zm(vec2 u,vec2 c,float z){return c+(u-c)/z;}
vec2 rc(vec2 u,vec2 c,float a){vec2 k=vec2(AS(),1.);return rot((u-c)*k,a)/k+c;}
vec2 sq(vec2 u){return (u-.5)*vec2(AS(),1.);}
vec4 zbA(vec2 u,float k){vec4 s=vec4(0.);for(int i=0;i<12;i++)s+=TA(.5+(u-.5)*(1.-k*float(i)/11.));return s/12.;}
vec4 zbB(vec2 u,float k){vec4 s=vec4(0.);for(int i=0;i<12;i++)s+=TB(.5+(u-.5)*(1.-k*float(i)/11.));return s/12.;}
vec4 dbA(vec2 u,vec2 d){vec4 s=vec4(0.);for(int i=0;i<12;i++)s+=TA(u+d*(float(i)/11.-.5));return s/12.;}
vec4 dbB(vec2 u,vec2 d){vec4 s=vec4(0.);for(int i=0;i<12;i++)s+=TB(u+d*(float(i)/11.-.5));return s/12.;}
vec4 sbA(vec2 u,float a){vec4 s=vec4(0.);for(int i=0;i<12;i++)s+=TA(rc(u,vec2(.5),a*(float(i)/11.-.5)));return s/12.;}
vec4 sbB(vec2 u,float a){vec4 s=vec4(0.);for(int i=0;i<12;i++)s+=TB(rc(u,vec2(.5),a*(float(i)/11.-.5)));return s/12.;}
vec4 bA(vec2 u,float r){vec4 s=vec4(0.);for(int i=0;i<5;i++)for(int j=0;j<5;j++)s+=TA(u+vec2(float(i)-2.,float(j)-2.)*r*vec2(1./AS(),1.)*.5);return s/25.;}
vec4 bB(vec2 u,float r){vec4 s=vec4(0.);for(int i=0;i<5;i++)for(int j=0;j<5;j++)s+=TB(u+vec2(float(i)-2.,float(j)-2.)*r*vec2(1./AS(),1.)*.5);return s/25.;}
vec4 rgbA(vec2 u,vec2 d){vec4 g=TA(u);return vec4(TA(u+d).r,g.g,TA(u-d).b,g.a);}
vec4 rgbB(vec2 u,vec2 d){vec4 g=TB(u);return vec4(TB(u+d).r,g.g,TB(u-d).b,g.a);}
vec4 X(vec2 u,float w){return w<.5?TA(u):TB(u);}
vec4 mixAB(vec2 u,float w){return mix(TA(u),TB(u),w);}
vec2 bulge(vec2 u,float k){vec2 q=sq(u);float r=length(q);q*=1.+k*r*r;return q/vec2(AS(),1.)+.5;}
vec2 twirl(vec2 u,float a){vec2 q=sq(u);float r=length(q);q=rot(q,a*smoothstep(.95,0.,r));return q/vec2(AS(),1.)+.5;}
// a flat card (a frame-sized picture) hit by the ray through screen point u: xy = its own uv, z = depth (or -1)
vec3 card(vec2 u,vec3 Q,vec3 e1,vec3 e2){float f=2.4;vec3 C=vec3(0.,0.,-f);vec3 r=vec3((u-.5)*2.*vec2(AS(),1.),f);vec3 n=cross(e1,e2);
  float dn=dot(r,n);if(abs(dn)<1e-5)return vec3(0.,0.,-1.);float t=dot(Q-C,n)/dn;vec3 P=C+t*r-Q;
  vec2 l=vec2(dot(P,e1)/AS(),dot(P,e2))*.5+.5;return (t>0.&&inb(l))?vec3(l,t):vec3(l,-1.);}
vec3 ry(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(c*v.x+s*v.z,v.y,-s*v.x+c*v.z);}
vec3 rx(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x,c*v.y-s*v.z,s*v.y+c*v.z);}
vec4 bg(vec2 u){return mix(bA(u,.06),bB(u,.06),smoothstep(.3,.7,p))*vec4(.35,.35,.35,1.);}
`;
  // template helpers for families that only differ by a direction
  const whip = (dx, dy, rgb) => `vec4 tr(vec2 u){float e=io(p),b=pow(sin(PI*p),3.);vec2 D=vec2(${dx}.,${dy}.);vec2 o=D*e,d=D*b*.3;
  vec2 v=e<.5?u+o:u+o-D;${rgb ? 'vec2 s=D*b*.035;vec4 g=e<.5?dbA(v,d):dbB(v,d);return vec4((e<.5?dbA(v+s,d):dbB(v+s,d)).r,g.g,(e<.5?dbA(v-s,d):dbB(v-s,d)).b,g.a);' : 'return e<.5?dbA(v,d):dbB(v,d);'}}`;
  const stretch = (ax) => `vec4 tr(vec2 u){float b=sin(PI*p);vec2 D=vec2(${ax === 'x' ? '1.,0.' : '0.,1.'});
  if(p<.5){float t=ei(p*2.);vec2 v=u;v${'.' + ax}=.5+(v${'.' + ax}-.5)/(1.+9.*t);return dbA(v,D*.25*t);}
  float t=1.-eo(p*2.-1.);vec2 v=u;v${'.' + ax}=.5+(v${'.' + ax}-.5)/(1.+9.*t);return dbB(v,D*.25*t);}`;
  const pano = (dx) => `vec4 tr(vec2 u){float e=io(p),b=pow(sin(PI*p),2.);vec2 c=u-.5;c.x*=1.+b*1.6*c.y*c.y;c.y*=1.-b*.25*(1.-4.*c.x*c.x);
  vec2 v=c+.5+vec2(${dx}.*e,0.);vec2 d=vec2(${dx}.*b*.25,0.);return e<.5?dbA(v,d):dbB(v-vec2(${dx}.,0.),d);}`;
  const cubeH = (sg) => `vec4 tr(vec2 u){float a=${sg}.*io(p)*PI*.5,z=sin(PI*p)*1.2,h=AS();vec3 K=vec3(0.,0.,h+z);
  vec3 A=card(u,K+ry(vec3(0.,0.,-h),a),ry(vec3(1.,0.,0.),a),vec3(0.,1.,0.));
  vec3 B=card(u,K+ry(vec3(${sg}.*h,0.,0.),a),ry(vec3(0.,0.,${sg}.),a),vec3(0.,1.,0.));
  float la=.55+.45*abs(cos(a)),lb=.55+.45*abs(sin(a));
  if(A.z>0.&&(B.z<0.||A.z<B.z))return TA(A.xy)*vec4(la,la,la,1.);if(B.z>0.)return TB(B.xy)*vec4(lb,lb,lb,1.);return vec4(0.,0.,0.,1.);}`;
  const cubeV = (sg) => `vec4 tr(vec2 u){float a=${sg}.*io(p)*PI*.5,z=sin(PI*p)*1.2;vec3 K=vec3(0.,0.,1.+z);
  vec3 A=card(u,K+rx(vec3(0.,0.,-1.),a),vec3(1.,0.,0.),rx(vec3(0.,1.,0.),a));
  vec3 B=card(u,K+rx(vec3(0.,${-1 * sg}.,0.),a),vec3(1.,0.,0.),rx(vec3(0.,0.,${-1 * sg}.),a));
  float la=.55+.45*abs(cos(a)),lb=.55+.45*abs(sin(a));
  if(A.z>0.&&(B.z<0.||A.z<B.z))return TA(A.xy)*vec4(la,la,la,1.);if(B.z>0.)return TB(B.xy)*vec4(lb,lb,lb,1.);return vec4(0.,0.,0.,1.);}`;
  const flip = (ax) => `vec4 tr(vec2 u){float a=io(p)*PI,z=sin(PI*p)*1.5;vec3 Q=vec3(0.,0.,z);
  vec3 e1=${ax === 'y' ? 'ry(vec3(1.,0.,0.),a)' : 'vec3(1.,0.,0.)'},e2=${ax === 'y' ? 'vec3(0.,1.,0.)' : 'rx(vec3(0.,1.,0.),a)'};vec3 c=card(u,Q,e1,e2);
  if(c.z<0.)return bg(u)*.6;float l=.5+.5*abs(cos(a));vec2 v=c.xy;if(a>PI*.5)v${ax === 'y' ? '.x' : '.y'}=1.-v${ax === 'y' ? '.x' : '.y'};return (a<PI*.5?TA(v):TB(v))*vec4(l,l,l,1.);}`;
  const blinds = (ax, n) => `vec4 tr(vec2 u){float e=io(p);float f=fract(u.${ax}*${n}.);return f<e?TB(u):TA(u);}`;

  const LIST = [
    // camera moves (lens zoom, whips, spins): the cut happens in the middle, hidden by the motion
    ['lensIn', 'cam', `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);return zbA(zm(u,vec2(.5),1.+2.*t),.45*t);}
  float t=eo(p*2.-1.);return zbB(zm(u,vec2(.5),.5+.5*t),.45*(1.-t));}`],
    ['lensOut', 'cam', `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);return zbA(zm(u,vec2(.5),1.-.5*t),.45*t);}
  float t=eo(p*2.-1.);return zbB(zm(u,vec2(.5),3.-2.*t),.45*(1.-t));}`],
    ['lensRgb', 'cam', `vec4 tr(vec2 u){float b=pow(sin(PI*p),2.);vec2 d=(u-.5)*.06*b;float k=.45*b;
  if(p<.5){vec2 v=zm(u,vec2(.5),1.+2.*ei(p*2.));vec4 g=zbA(v,k);return vec4(zbA(v+d,k).r,g.g,zbA(v-d,k).b,g.a);}
  vec2 v=zm(u,vec2(.5),.5+.5*eo(p*2.-1.));vec4 g=zbB(v,k);return vec4(zbB(v+d,k).r,g.g,zbB(v-d,k).b,g.a);}`],
    ['whipL', 'cam', whip(1, 0)], ['whipR', 'cam', whip(-1, 0)], ['whipU', 'cam', whip(0, -1)], ['whipD', 'cam', whip(0, 1)],
    ['whipRgb', 'cam', whip(1, 0, true)],
    ['spinZoom', 'cam', `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);return sbA(zm(rc(u,vec2(.5),-t*2.4),vec2(.5),1.+.7*t),.9*t);}
  float t=1.-eo(p*2.-1.);return sbB(zm(rc(u,vec2(.5),t*2.4),vec2(.5),1.+.7*t),.9*t);}`],
    ['turbo', 'cam', `vec4 tr(vec2 u){float b=sin(PI*p);float k=abs(sin(p*PI*4.));float z=1.+.35*k*b+1.2*b*b;return p<.5?zbA(zm(u,vec2(.5),z),.5*b):zbB(zm(u,vec2(.5),z),.5*b);}`],
    ['shakeCam', 'cam', `vec4 tr(vec2 u){float b=sin(PI*p);float f=floor(p*26.);vec2 o=(vec2(h1(vec2(f,1.)),h1(vec2(f,2.)))-.5)*.14*b;
  float a=(h1(vec2(f,3.))-.5)*.12*b;vec2 v=zm(rc(u,vec2(.5),a),vec2(.5),1.+.15*b)+o;return p<.5?dbA(v,o*.8):dbB(v,o*.8);}`],
    ['bounce', 'cam', `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);return TA(zm(bulge(u,-.7*t),vec2(.5),1.-.4*t));}
  float t=p*2.-1.;float s=1.-.4*exp(-5.*t)*cos(9.*t);return TB(zm(bulge(u,-.7*(1.-t)*(1.-t)),vec2(.5),s));}`],
    ['focus', 'cam', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 v=zm(u,vec2(.5),1.+.08*b);vec4 c=p<.5?bA(v,.05*b):bB(v,.05*b);return c*vec4(vec3(1.+.25*b),1.);}`],
    ['blink', 'cam', `vec4 tr(vec2 u){float c=pow(sin(PI*p),1.6);float x=u.x*2.-1.;float edge=(1.-c)*(1.-.35*x*x);float d=abs(u.y-.5)*2.;
  vec4 img=p<.5?bA(u,.04*c):bB(u,.04*c);return mix(img,vec4(0.,0.,0.,1.),smoothstep(edge-.06,edge+.02,d));}`],
    ['rewind', 'cam', `vec4 tr(vec2 u){float b=sin(PI*p);float f=floor(p*30.);vec2 v=u;v.x+=(h1(vec2(floor(u.y*70.),f))-.5)*.08*b;v.y+=b*.05*sin(p*40.);
  vec4 c=p<.5?rgbA(v,vec2(.012*b,0.)):rgbB(v,vec2(.012*b,0.));float g=dot(c.rgb,vec3(.3,.59,.11));c.rgb=mix(c.rgb,vec3(g),.6*b);
  c.rgb*=1.-.25*b*step(.5,fract(u.y*R.y/4.));return c;}`],
    ['stretchV', 'cam', stretch('y')], ['stretchH', 'cam', stretch('x')],
    ['panoL', 'cam', pano(1)], ['panoR', 'cam', pano(-1)],
    // blur
    ['blurMix', 'blur', `vec4 tr(vec2 u){float b=sin(PI*p);return mix(bA(u,.06*b),bB(u,.06*b),smoothstep(.3,.7,p));}`],
    ['radialBlur', 'blur', `vec4 tr(vec2 u){float b=sin(PI*p);return mix(zbA(u,.5*b),zbB(u,.5*b),smoothstep(.35,.65,p));}`],
    ['swing', 'blur', `vec4 tr(vec2 u){vec2 pv=vec2(.5,1.6);if(p<.5){float t=ei(p*2.);return sbA(rc(u,pv,-.5*t)+vec2(0.,0.),.25*t);}
  float t=1.-eo(p*2.-1.);return sbB(rc(u,pv,.5*t),.25*t);}`],
    ['blurDown', 'blur', `vec4 tr(vec2 u){float e=io(p),b=pow(sin(PI*p),3.);vec2 v=u+vec2(0.,e);vec2 d=vec2(0.,.45*b);return e<.5?dbA(v,d):dbB(v-vec2(0.,1.),d);}`],
    ['mosaic', 'blur', `vec4 tr(vec2 u){float b=sin(PI*p);float s=mix(1./R.y,.09,b*b);vec2 k=vec2(s/AS(),s);vec2 v=(floor(u/k)+.5)*k;return mixAB(v,smoothstep(.4,.6,p));}`],
    ['ink', 'blur', `vec4 tr(vec2 u){float n=fbm(sq(u)*5.);float e=p*1.25-.1;float m=smoothstep(e-.05,e,n);vec4 c=mix(TB(u),TA(u),m);
  float rim=smoothstep(.08,0.,abs(n-e+.02));return mix(c,vec4(0.,0.,0.,1.),rim*.7*sin(PI*p));}`],
    ['melt', 'blur', `vec4 tr(vec2 u){float e=ei(p);float dr=fbm(vec2(u.x*9.,1.))*.8+.2;vec2 v=u+vec2(0.,e*(1.3+dr*1.2));
  if(v.y>1.)return TB(u);return dbA(v,vec2(0.,.15*e));}`],
    ['grid', 'blur', `vec4 tr(vec2 u){vec2 n=vec2(4.,7.);vec2 c=floor(u*n);vec2 l=fract(u*n)-.5;float d=h1(c)*.5;float q=clamp((p-d*.8)/.55,0.,1.);
  float s=abs(1.-2.*io(q));if(s<.02)return bg(u);vec2 m=l/s;if(abs(m.x)>.5||abs(m.y)>.5)return bg(u);vec2 v=(c+.5+m)/n;return q<.5?TA(v):TB(v);}`],
    // glitch
    ['glitchBlock', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);float f=floor(p*22.);vec2 bl=floor(u*vec2(7.,22.));float r=h1(bl+f);
  vec2 v=u;if(r>1.-b*.7)v.x+=(h1(bl*1.7+f)-.5)*.25;vec2 d=vec2(.025*b,0.);float w=p+(h1(bl*3.1+f)-.5)*.5*b;return w<.5?rgbA(v,d):rgbB(v,d);}`],
    ['slices', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);float row=floor(u.y*24.);float r=h1(vec2(row,7.));vec2 v=u+vec2((r-.5)*.6*b*b,0.);
  return p+(r-.5)*.3<.5?TA(v):TB(v);}`],
    ['digital', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 k=vec2(28./AS(),28.)*(1.-.75*b);vec2 c=floor(u*k);float r=h1(c+floor(p*14.));
  vec2 v=mix(u,(c+.5)/k,step(.5,b));vec4 col=r<p?TB(v):TA(v);col.rgb=mix(col.rgb,floor(col.rgb*4.)/4.,b);return col;}`],
    ['vhs', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 v=u;float band=step(.92,fract(u.y*3.-p*4.));v.x+=band*.05*b+(vn(vec2(u.y*90.,p*50.))-.5)*.03*b;
  vec4 c=p<.5?rgbA(v,vec2(.02*b,0.)):rgbB(v,vec2(.02*b,0.));c.rgb+=(h1(u*R+p)-.5)*.25*b;return c;}`],
    ['smear', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);float row=floor(u.y*80.);float on=step(.55,h1(vec2(row,floor(p*12.))));vec2 v=u;v.x=mix(u.x,floor(u.x*2.+h1(vec2(row,3.)))/2.,on*b);
  return p<.5?rgbA(v,vec2(.01*b,0.)):rgbB(v,vec2(.01*b,0.));}`],
    ['rgbSplit', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 d=vec2(.06,.015)*b*sign(sin(p*50.));vec2 v=zm(u,vec2(.5),1.+.1*b);return p<.5?rgbA(v,d):rgbB(v,d);}`],
    // light
    ['flash', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);float w=pow(b,2.2);vec4 c=p<.5?bA(u,.03*b):bB(u,.03*b);return vec4(mix(c.rgb*(1.+2.*w),vec3(1.),w),c.a);}`],
    ['leakWarm', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 c=mixAB(u,smoothstep(.35,.65,p));float g=exp(-pow((u.x+u.y*.4-(p*1.9-.4))*2.2,2.));
  float n=fbm(u*2.+vec2(p*2.,0.));vec3 L=mix(vec3(1.,.42,.12),vec3(1.,.85,.5),n)*g*(.6+n)*b*1.8;return vec4(1.-(1.-c.rgb)*(1.-min(L,1.)),c.a);}`],
    ['leakPink', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 c=mixAB(u,smoothstep(.35,.65,p));float g=exp(-pow((length(u-vec2(1.,1.))-(p*1.8-.3))*2.,2.));
  float n=fbm(u*2.5-vec2(0.,p*2.));vec3 L=mix(vec3(1.,.25,.55),vec3(.6,.3,1.),n)*g*(.6+n)*b*1.8;return vec4(1.-(1.-c.rgb)*(1.-min(L,1.)),c.a);}`],
    ['flare', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 c=mixAB(u,smoothstep(.4,.6,p));float y=.5+.15*sin(p*3.);float s=exp(-abs(u.y-y)*60.)*(.4+.6*exp(-abs(u.x-p*1.4+.2)*3.));
  vec3 L=vec3(.55,.75,1.)*s*2.5*b+vec3(1.)*pow(b,4.)*.6;return vec4(c.rgb+L,c.a);}`],
    ['strobe', 'light', `vec4 tr(vec2 u){float k=floor(p*5.);float w=mod(k,2.);if(p>.8)w=1.;float fl=pow(1.-fract(p*5.),3.)*.8;vec4 c=X(u,w);return vec4(c.rgb+fl,c.a);}`],
    ['burn', 'light', `vec4 tr(vec2 u){float n=fbm(sq(u)*3.+vec2(0.,p));float e=p*1.3-.15;float d=e-n;vec4 c=d>0.?TB(u):TA(u);
  float rim=smoothstep(.12,0.,abs(d));vec3 hot=mix(vec3(1.,.35,.05),vec3(1.,.9,.6),smoothstep(.06,0.,abs(d)));c.rgb=mix(c.rgb,hot,rim*.95);if(d<0.&&d>-.2)c.rgb*=1.-(.2+d)*1.5;return c;}`],
    ['golden', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 c=mixAB(u,smoothstep(.4,.6,p));vec3 t=c.rgb*vec3(1.25,1.05,.75);return vec4(mix(c.rgb,1.-(1.-t)*(1.-t*b*1.5),b),c.a);}`],
    ['prism', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 d=(u-.5)*.12*b;vec2 v=zm(u,vec2(.5),1.+.15*b);vec4 c=mix(rgbA(v,d),rgbB(v,d),smoothstep(.4,.6,p));
  c.rgb+=vec3(sin(u.x*12.+p*9.),sin(u.x*12.+p*9.+2.),sin(u.x*12.+p*9.+4.))*.12*b;return c;}`],
    // 3D
    ['cubeL', '3d', cubeH(1)], ['cubeR', '3d', cubeH(-1)], ['cubeU', '3d', cubeV(1)], ['cubeD', '3d', cubeV(-1)],
    ['flipY', '3d', flip('y')], ['flipX', '3d', flip('x')],
    ['doors', '3d', `vec4 tr(vec2 u){float a=ei(p)*PI*.55;float h=AS();float l=1.-.5*sin(a);
  vec3 L=card(u,vec3(-h+h*cos(a),0.,h*sin(a)),vec3(cos(a),0.,sin(a)),vec3(0.,1.,0.));vec3 Q=card(u,vec3(h-h*cos(a),0.,h*sin(a)),vec3(cos(a),0.,-sin(a)),vec3(0.,1.,0.));
  bool hl=L.z>0.&&L.x<.5,hr=Q.z>0.&&Q.x>.5;if(hl&&(!hr||L.z<Q.z))return TA(L.xy)*vec4(l,l,l,1.);if(hr)return TA(Q.xy)*vec4(l,l,l,1.);return TB(zm(u,vec2(.5),.85+.15*eo(p)));}`],
    ['swap', '3d', `vec4 tr(vec2 u){float e=io(p),z=sin(PI*p)*1.6,h=AS();vec3 A=card(u,vec3(-2.2*h*e,0.,z),ry(vec3(1.,0.,0.),.7*e),vec3(0.,1.,0.));
  vec3 B=card(u,vec3(2.2*h*(1.-e),0.,z),ry(vec3(1.,0.,0.),-.7*(1.-e)),vec3(0.,1.,0.));
  if(A.z>0.&&(B.z<0.||A.z<B.z))return TA(A.xy);if(B.z>0.)return TB(B.xy);return bg(u);}`],
    ['gallery', '3d', `vec4 tr(vec2 u){float s=1.-.28*smoothstep(0.,.3,p)*(1.-smoothstep(.7,1.,p));float x=io(clamp((p-.25)/.5,0.,1.))*1.12;
  vec2 la=(u-.5-vec2(-x*s,0.))/s+.5,lb=(u-.5-vec2((1.12-x)*s,0.))/s+.5;if(inb(la))return TA(la);if(inb(lb))return TB(lb);return bg(u);}`],
    ['tiles', '3d', `vec4 tr(vec2 u){vec2 n=vec2(4.,7.);vec2 c=floor(u*n);vec2 l=fract(u*n);float q=clamp(p*1.8-(c.x+n.y-1.-c.y)/(n.x+n.y)*.8,0.,1.);
  float k=abs(cos(PI*q));if(k<.02)return bg(u);float x=(l.x-.5)/k+.5;if(x<0.||x>1.)return bg(u);vec2 v=(c+vec2(x,l.y))/n;float sh=.6+.4*k;return (q<.5?TA(v):TB(v))*vec4(sh,sh,sh,1.);}`],
    ['panels', '3d', `vec4 tr(vec2 u){float i=floor(u.x*3.);float q=clamp((p-i*.12)/.64,0.,1.);float e=io(q);float sg=mod(i,2.)<.5?1.:-1.;float o=sg*(1.-e);
  vec2 v=u-vec2(0.,o);if(v.y>=0.&&v.y<=1.)return TB(v);return TA(v+vec2(0.,sg));}`],
    // shape masks
    ['heart', 'mask', `float sdf(vec2 q){q.y=q.y+.55;q.x=abs(q.x);if(q.y+q.x>1.)return sqrt(dot(q-vec2(.25,.75),q-vec2(.25,.75)))-.3536;
  return sqrt(min(dot(q-vec2(0.,1.),q-vec2(0.,1.)),dot(q-.5*max(q.x+q.y,0.),q-.5*max(q.x+q.y,0.))))*sign(q.x-q.y);}
vec4 tr(vec2 u){float e=io(p);vec2 q=sq(u)/max(.001,e*2.4);return mix(TB(u),TA(u),smoothstep(-.01,.01,sdf(q)));}`],
    ['star', 'mask', `float sdf(vec2 q){float an=3.14159/5.;float en=3.14159/2.4;vec2 acs=vec2(cos(an),sin(an));vec2 ecs=vec2(cos(en),sin(en));
  float bn=mod(atan(q.x,q.y),2.*an)-an;q=length(q)*vec2(cos(bn),abs(sin(bn)));q-=.5*acs;q+=ecs*clamp(-dot(q,ecs),0.,.5*acs.y/ecs.y);return length(q)*sign(q.x);}
vec4 tr(vec2 u){float e=io(p);vec2 q=sq(u)/max(.001,e*2.6);return mix(TB(u),TA(u),smoothstep(-.01,.01,sdf(q)));}`],
    ['diamond', 'mask', `vec4 tr(vec2 u){float e=io(p);vec2 q=abs(sq(u));float d=q.x+q.y-e*1.6;return mix(TB(u),TA(u),smoothstep(-.01,.01,d));}`],
    ['clock', 'mask', `vec4 tr(vec2 u){float e=io(p);vec2 q=sq(u);float a=(atan(q.x,q.y)+PI)/(2.*PI);return mix(TB(u),TA(u),smoothstep(-.005,.005,a-e));}`],
    ['iris', 'mask', `vec4 tr(vec2 u){float r=abs(1.-2.*io(p))*1.2;float d=length(sq(u))-r;vec4 c=p<.5?TA(u):TB(u);return mix(c,vec4(0.,0.,0.,1.),smoothstep(-.01,.01,d));}`],
    ['blindsH', 'mask', blinds('y', 10)], ['blindsV', 'mask', blinds('x', 8)],
    ['checker', 'mask', `vec4 tr(vec2 u){vec2 c=floor(u*vec2(6.,10.));float odd=mod(c.x+c.y,2.);float q=clamp(p*2.-odd*.6,0.,1.);vec2 l=abs(fract(u*vec2(6.,10.))-.5);
  return max(l.x,l.y)<io(q)*.5?TB(u):TA(u);}`],
    ['torn', 'mask', `vec4 tr(vec2 u){float e=io(p)*1.6-.3;float f=u.x+u.y*.3+(fbm(u*vec2(10.,14.))-.5)*.12;float d=f-e;
  if(d<0.)return TB(u)*vec4(vec3(1.-.4*smoothstep(-.06,0.,d)),1.);if(d<.018)return vec4(.96,.95,.92,1.);return TA(u);}`],
    ['inkblot', 'mask', `vec4 tr(vec2 u){float e=io(p);vec2 q=sq(u);float d=length(q)-(e*1.3)*(.75+.5*fbm(q*3.+7.));return mix(TB(u),TA(u),smoothstep(-.02,.02,d));}`],
    ['diag', 'mask', `vec4 tr(vec2 u){float e=io(p)*1.4-.2;float d=(u.x+u.y)*.5-e;return mix(TB(u),TA(u),smoothstep(-.06,.06,d));}`],
    // slides
    ['snap', 'slide', `vec4 tr(vec2 u){float o=1.-bk(smoothstep(0.,1.,p));vec2 v=u-vec2(o,0.);if(v.x>=0.)return dbB(v,vec2(.2*abs(o)*(1.-p),0.));return TA(v+vec2(1.,0.));}`],
    ['squeeze', 'slide', `vec4 tr(vec2 u){float e=io(p);float x=1.-e;if(u.x<x)return TA(vec2(u.x/max(x,.001),u.y));return TB(vec2((u.x-x)/max(e,.001),u.y));}`],
    ['reveal', 'slide', `vec4 tr(vec2 u){float e=io(p);vec2 v=u-vec2(0.,e);vec4 b=TB(zm(u,vec2(.5),.9+.1*e))*vec4(vec3(.6+.4*e),1.);if(v.y>=0.)return TA(v);
  return mix(b,vec4(0.,0.,0.,1.),.5*smoothstep(-.06,0.,v.y));}`],
    ['split3', 'slide', `vec4 tr(vec2 u){float i=floor(u.y*3.);float q=clamp((p-i*.12)/.64,0.,1.);float e=io(q);float sg=mod(i,2.)<.5?1.:-1.;float o=sg*(1.-e);
  vec2 v=u-vec2(o,0.);if(v.x>=0.&&v.x<=1.)return dbB(v,vec2(.15*sin(PI*q),0.));return dbA(v+vec2(sg,0.),vec2(.15*sin(PI*q),0.));}`],
    ['dimSlide', 'slide', `vec4 tr(vec2 u){float s=1.-.18*sin(PI*p);float x=io(p);vec2 la=(u-.5+vec2(x*s*1.05,0.))/s+.5,lb=(u-.5-vec2((1.-x)*s*1.05,0.))/s+.5;
  if(inb(la))return TA(la)*vec4(vec3(1.-.5*x),1.);if(inb(lb))return TB(lb);return vec4(0.,0.,0.,1.);}`],
    ['pushZoom', 'slide', `vec4 tr(vec2 u){float e=io(p),b=sin(PI*p);vec2 v=zm(u,vec2(.5),1.-.25*b)+vec2(e,0.);if(v.x<=1.)return TA(v);return TB(v-vec2(1.,0.));}`],
    // distortion
    ['ripple', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=sq(u);float r=length(q);vec2 v=u+normalize(q+1e-5)*sin(r*40.-p*30.)*.03*b/vec2(AS(),1.);return mixAB(v,smoothstep(.35,.65,p));}`],
    ['wave', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 v=u+vec2(sin(u.y*18.+p*12.),cos(u.x*14.+p*9.))*.045*b;return mixAB(v,smoothstep(.35,.65,p));}`],
    ['liquid', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 v=u+(vec2(fbm(u*3.+p*2.),fbm(u*3.+5.2-p*2.))-.5)*.35*b;return mixAB(v,smoothstep(.35,.65,p));}`],
    ['swirl', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);float a=p<.5?7.*ei(p*2.):-7.*(1.-eo(p*2.-1.));vec2 v=twirl(u,a);return p<.5?zbA(v,.25*b):zbB(v,.25*b);}`],
    ['fisheye', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 v=bulge(u,3.*b);v=zm(v,vec2(.5),1.+.3*b);return mixAB(v,smoothstep(.42,.58,p));}`],
    ['pinch', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 v=bulge(u,-1.8*b);return mixAB(v,smoothstep(.42,.58,p));}`],
    ['kaleido', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=sq(u);float n=6.;float a=atan(q.y,q.x)+p*2.;float s=2.*PI/n;a=abs(mod(a,s)-s*.5);vec2 k=length(q)*vec2(cos(a),sin(a));
  vec2 v=mix(u,k/vec2(AS(),1.)+.5,smoothstep(0.,.35,b));return mixAB(v,smoothstep(.4,.6,p));}`],
    ['crack', 'warp', `vec2 cell(vec2 q,out float id){vec2 i=floor(q),f=fract(q);float md=9.;vec2 mc=vec2(0.);for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));
  vec2 o=vec2(h1(i+g),h1(i+g+9.));vec2 r=g+o-f;float d=dot(r,r);if(d<md){md=d;mc=i+g+o;}}id=h1(mc);return mc;}
vec4 tr(vec2 u){vec2 k=vec2(4.*AS(),4.);float id;vec2 c=cell(u*k,id);float q=clamp((p-.25-id*.25)/.5,0.,1.);if(p<.25){
  float id2;vec2 c2=cell(u*k+.02,id2);float edge=step(.001,length(c-c2));return TA(u)+vec4(vec3(edge*p*4.),0.);}
  vec2 m=(u*k-c)/(1.-q+.001)+c;float id3;vec2 c3=cell(m,id3);vec2 v=m/k+vec2(0.,-q*q*.6);if(q<1.&&length(c3-c)<.001&&inb(v))return TA(v)*vec4(vec3(1.-q*.5),1.);return TB(u);}`],
  ];
  const CATS = ['cam', 'blur', 'glitch', 'light', '3d', 'mask', 'slide', 'warp'];
  const api = { HEAD, LIST, CATS, ids: LIST.map(x => x[0]), cat: Object.fromEntries(LIST.map(x => [x[0], x[1]])) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KadrGLT = api;
})(this);
