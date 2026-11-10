// Shader transitions. Each one is a GLSL body `vec4 tr(vec2 u)` that mixes layer A (the outgoing clip,
// held on its last frame) and layer B (the incoming clip) at progress p (0..1). Both layers are full
// frames with alpha; sampling outside 0..1 mirrors, so zooms and pushes never show empty edges.
// The preview runs them every frame; the export renders the same frames to PNGs (see app.js).
(function (root) {
  const HEAD = `precision highp float;
varying vec2 uv0;
uniform sampler2D tA, tB;
uniform float p;
uniform vec2 RR;
uniform float D;
vec2 R;
#define PI 3.14159265
float AS(){return R.x/R.y;}
vec2 mir(vec2 u){vec2 m=mod(u,2.);return mix(m,2.-m,step(1.,m));}
// D turns the whole transition: the shader works in turned space, pictures are read back through dinv
vec2 dfwd(vec2 s){return D<.5?s:D<1.5?vec2(s.y,1.-s.x):D<2.5?1.-s:vec2(1.-s.y,s.x);}
vec2 dinv(vec2 u){return D<.5?u:D<1.5?vec2(1.-u.y,u.x):D<2.5?1.-u:vec2(u.y,1.-u.x);}
vec4 TA(vec2 u){return texture2D(tA,mir(dinv(u)));}
vec4 TB(vec2 u){return texture2D(tB,mir(dinv(u)));}
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
float jit(){return h1(gl_FragCoord.xy+fract(p*7.));}
vec4 zbA(vec2 u,float k){vec4 s=vec4(0.);float j=jit();for(int i=0;i<20;i++)s+=TA(.5+(u-.5)*(1.-k*(float(i)+j)/20.));return s/20.;}
vec4 zbB(vec2 u,float k){vec4 s=vec4(0.);float j=jit();for(int i=0;i<20;i++)s+=TB(.5+(u-.5)*(1.-k*(float(i)+j)/20.));return s/20.;}
vec4 dbA(vec2 u,vec2 d){vec4 s=vec4(0.);float j=jit();for(int i=0;i<20;i++)s+=TA(u+d*((float(i)+j)/20.-.5));return s/20.;}
vec4 dbB(vec2 u,vec2 d){vec4 s=vec4(0.);float j=jit();for(int i=0;i<20;i++)s+=TB(u+d*((float(i)+j)/20.-.5));return s/20.;}
vec4 sbA(vec2 u,float a){vec4 s=vec4(0.);float j=jit();for(int i=0;i<20;i++)s+=TA(rc(u,vec2(.5),a*((float(i)+j)/20.-.5)));return s/20.;}
vec4 sbB(vec2 u,float a){vec4 s=vec4(0.);float j=jit();for(int i=0;i<20;i++)s+=TB(rc(u,vec2(.5),a*((float(i)+j)/20.-.5)));return s/20.;}
vec2 spiral(int i,float r){float f=float(i)+.5;float a=f*2.39996+jit()*6.283;return vec2(cos(a),sin(a))*sqrt(f/24.)*r*vec2(1./AS(),1.);}
vec4 bA(vec2 u,float r){vec4 s=vec4(0.);for(int i=0;i<24;i++)s+=TA(u+spiral(i,r));return s/24.;}
vec4 bB(vec2 u,float r){vec4 s=vec4(0.);for(int i=0;i<24;i++)s+=TB(u+spiral(i,r));return s/24.;}
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

  // film family helpers: screen blend, burn colour ramp, rounded box, and moving grain + dust at 24 fps
  const F = `vec3 scr(vec3 a,vec3 b){return 1.-(1.-a)*(1.-b);}
vec3 ramp(float i){return i<.5?mix(vec3(.45,.02,0.),vec3(1.,.35,.02),i*2.):mix(vec3(1.,.35,.02),vec3(1.,.97,.75),i*2.-1.);}
float rr(vec2 q,vec2 h,float r){vec2 d=abs(q)-h+r;return length(max(d,0.))+min(max(d.x,d.y),0.)-r;}
vec4 film(vec4 c,vec2 u,float k){float f=floor(p*24.);c.rgb+=(h1(floor(u*R*.5)+f*.37)-.5)*.12*k;
  c.rgb=mix(c.rgb,vec3(1.),step(.9985,h1(floor(u*R/3.)+f))*k);return c;}
`;
  // a fat painted brush stroke that zig-zags over the frame, then wipes back off to show the next clip
  const scrib = (col) => `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float q=p<.5?p*2.:2.-p*2.;vec2 s=sq(u);float n=vn(u*40.)*.5+fbm(u*6.)*.5;float M=0.;
  for(int i=0;i<4;i++){float fi=float(i);float t=clamp(q*4.-fi,0.,1.);float x=s.x*(mod(fi,2.)<.5?1.:-1.);
    float yl=-.62+fi*.42+x*.35+sin(x*6.+fi)*.05;float W=AS()*.5+.1;
    M=max(M,step(abs(s.y-yl)-.27+(n-.5)*.06,0.)*step(x,-W+2.*W*t+(n-.5)*.05));}
  M=max(M,step(.98,q));vec4 c=X(u,p);return film(vec4(mix(c.rgb,${col}*(.8+.35*n),M),1.),u,b*.5);}`;
  // seamless-pack helpers: elastic and bounce easing, rounded box, voronoi shards
  const G = `float el(float x){return 1.-pow(2.,-9.*x)*cos(x*PI*4.5);}
float bo(float x){if(x<1./2.75)return 7.5625*x*x;if(x<2./2.75){x-=1.5/2.75;return 7.5625*x*x+.75;}if(x<2.5/2.75){x-=2.25/2.75;return 7.5625*x*x+.9375;}x-=2.625/2.75;return 7.5625*x*x+.984375;}
float rr(vec2 q,vec2 h,float r){vec2 d=abs(q)-h+r;return length(max(d,0.))+min(max(d.x,d.y),0.)-r;}
vec2 cell(vec2 q){vec2 i=floor(q),f=fract(q);float md=9.;vec2 mc=vec2(0.);for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));
  vec2 o=vec2(h1(i+g),h1(i+g+9.));vec2 r=g+o-f;float d=dot(r,r);if(d<md){md=d;mc=i+g+o;}}return mc;}
`;
  // the next clip pushes in from the top on an elastic or bouncing ease
  const flatE = (ease) => G + `vec4 tr(vec2 u){float e=${ease}(p),b=max(sin(PI*min(p*1.6,1.)),0.);float y=u.y-(1.-e);vec2 d=vec2(0.,.15*b);
  return y>=0.?dbB(vec2(u.x,y),d):dbA(vec2(u.x,y+1.),d);}`;
  // perspective: both clips ride tilted cards sideways, receding (in) or coming close (out)
  const persp = (sg, z) => G + `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float h=AS();float ang=${sg}.*.6*b;vec3 e1=ry(vec3(1.,0.,0.),ang),e2=vec3(0.,1.,0.);
  vec3 A=card(u,vec3(-e*2.2*h,0.,${z}*b),e1,e2),B=card(u,vec3((1.-e)*2.2*h,0.,${z}*b),e1,e2);
  if(A.z>0.)return dbA(A.xy,vec2(.08*b,0.));if(B.z>0.)return dbB(B.xy,vec2(.08*b,0.));return bg(u);}`;
  // stripes at angle a: alternate bands push the frame opposite ways, each band starting a little later
  const stripes = (a, n) => G + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 s=sq(u);vec2 d=vec2(cos(${a}),sin(${a}));float band=floor(dot(s,vec2(-d.y,d.x))*${n}.+100.);
  float t=clamp((p-.3*fract(band*.618))/.7,0.,1.),e=io(t),sg=mod(band,2.)<.5?1.:-1.,S=AS()*abs(d.x)+abs(d.y);
  vec2 ua=(s+d*sg*e*S)/vec2(AS(),1.)+.5,ub=(s+d*sg*(e-1.)*S)/vec2(AS(),1.)+.5;vec2 m=d/vec2(AS(),1.)*.12*sin(PI*t);
  return inb(ua)?dbA(ua,m):dbB(ub,m);}`;
  // colour-shape wipes: three flat coloured layers sweep over the cut one after another, then sweep off to show the next clip.
  // x is how far along the sweep each pixel sits (about 0..1); the expression gives each family its edge shape
  const shape = (xe, c0, c1, c2) => `float cv(float x,float a,float b){float w=1.5/R.y;return smoothstep(b-w,b+w,x)*(1.-smoothstep(a-w,a+w,x));}
float fr(float t){return -.35+1.7*io(clamp(t/.36,0.,1.));}
vec4 tr(vec2 u){vec2 s=sq(u);float x=${xe};
  float i0=fr(p),i1=fr(p-.07),i2=fr(p-.14),o2=fr(p-.5),o1=fr(p-.57),o0=fr(p-.64);
  vec4 c=x<i2?TB(u):TA(u);c.rgb=mix(c.rgb,${c0},cv(x,i0,o0));c.rgb=mix(c.rgb,${c1},cv(x,i1,o1));c.rgb=mix(c.rgb,${c2},cv(x,i2,o2));return c;}`;
  // pixel-experts helpers: hue rotation
  const PX = `vec3 hue(vec3 c,float a){vec3 k=vec3(.57735);float ca=cos(a);return c*ca+cross(k,c)*sin(a)+k*dot(k,c)*(1.-ca);}
`;
  const echo = (inv) => `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 s=vec4(0.);float W=0.;
  for(int i=0;i<6;i++){float k=float(i),w=pow(.6,k);s+=w*mixAB(zm(u,vec2(.5),1.+k*.06*b),smoothstep(.35,.65,p-k*.03*b));W+=w;}s/=W;
  ${inv ? 's.rgb=mix(s.rgb,1.-s.rgb,step(.3,p)*step(p,.75)*step(.5,h1(vec2(floor(p*12.),7.))));' : ''}return s;}`;
  const poster = (red) => `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(zm(u,vec2(.5),1.+.35*b),p);float L=mix(32.,3.,smoothstep(.1,.8,b));c.rgb=floor(c.rgb*L+.5)/L;
  ${red ? 'float on=step(.45,h1(vec2(floor(p*16.),3.)))*(1.-smoothstep(.05,.3,abs(p-.5)));c.rgb=mix(c.rgb,vec3(1.,.08,.06)*(.25+1.5*dot(c.rgb,vec3(.3,.59,.11))),on*.85);' : ''}return c;}`;
  // tech-nestology pack: zoom blur around any centre point
  const N = `vec4 zc(vec2 u,vec2 c,float k,bool b){vec4 s=vec4(0.);float j=jit();for(int i=0;i<16;i++){vec2 v=c+(u-c)*(1.-k*(float(i)+j)/16.);s+=b?TB(v):TA(v);}return s/16.;}
`;
  // the next clip moves in inside a growing shape while horizontal bands of both clips slide apart
  const dshape = (inside, k) => `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);vec2 s=sq(u);float sc=max(e*${k},.001);vec2 q=s/sc;
  float off=(h1(vec2(floor(u.y*9.),4.))-.5)*.25*b;vec2 v=u+vec2(off,0.);return (${inside})?TB(v-vec2(off*1.5,0.)):TA(v);}`;
  const LIST = [
    // camera moves (lens zoom, whips, spins): the cut happens in the middle, hidden by the motion
    ['lensIn', 'cam', `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);return zbA(zm(u,vec2(.5),1.+2.*t),.45*t);}
  float t=eo(p*2.-1.);return zbB(zm(u,vec2(.5),2.6-1.6*t),.45*(1.-t));}`],
    ['lensOut', 'cam', `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);return zbA(zm(u,vec2(.5),1.-.2*t),-.6*t);}
  float t=eo(p*2.-1.);return zbB(zm(u,vec2(.5),1.8-.8*t),-.6*(1.-t));}`],
    ['lensRgb', 'cam', `vec4 tr(vec2 u){float b=pow(sin(PI*p),2.);vec2 d=(u-.5)*.06*b;float k=.45*b;
  if(p<.5){vec2 v=zm(u,vec2(.5),1.+2.*ei(p*2.));vec4 g=zbA(v,k);return vec4(zbA(v+d,k).r,g.g,zbA(v-d,k).b,g.a);}
  vec2 v=zm(u,vec2(.5),2.6-1.6*eo(p*2.-1.));vec4 g=zbB(v,k);return vec4(zbB(v+d,k).r,g.g,zbB(v-d,k).b,g.a);}`],
    ['whipL', 'cam', whip(1, 0)], ['whipR', 'cam', whip(-1, 0)], ['whipU', 'cam', whip(0, -1)], ['whipD', 'cam', whip(0, 1)],
    ['whipRgb', 'cam', whip(1, 0, true)],
    ['spinZoom', 'cam', `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);return sbA(zm(rc(u,vec2(.5),-t*2.4),vec2(.5),1.+.7*t),.9*t);}
  float t=1.-eo(p*2.-1.);return sbB(zm(rc(u,vec2(.5),t*2.4),vec2(.5),1.+.7*t),.9*t);}`],
    ['turbo', 'cam', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float k=abs(sin(p*PI*4.));float z=1.+.35*k*b+1.2*b*b;return p<.5?zbA(zm(u,vec2(.5),z),.5*b):zbB(zm(u,vec2(.5),z),.5*b);}`],
    ['shakeCam', 'cam', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*26.);vec2 o=(vec2(h1(vec2(f,1.)),h1(vec2(f,2.)))-.5)*.14*b;
  float a=(h1(vec2(f,3.))-.5)*.12*b;vec2 v=zm(rc(u,vec2(.5),a),vec2(.5),1.+.15*b)+o;return p<.5?dbA(v,o*.8):dbB(v,o*.8);}`],
    ['bounce', 'cam', `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);vec2 v=zm(bulge(u,-.5*t),vec2(.5),1.-.35*t);return inb(v)?TA(v):bg(u);}
  float t=p*2.-1.;float s=1.-.35*exp(-5.*t)*cos(9.*t);vec2 v=zm(bulge(u,-.5*(1.-t)*(1.-t)),vec2(.5),s);return inb(v)?TB(v):bg(u);}`],
    ['focus', 'cam', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=zm(u,vec2(.5),1.+.08*b);vec4 c=p<.5?bA(v,.05*b):bB(v,.05*b);return c*vec4(vec3(1.+.25*b),1.);}`],
    ['blink', 'cam', `vec4 tr(vec2 u){float c=pow(sin(PI*p),2.6);float x=u.x*2.-1.;float edge=1.-c;float d=abs(u.y-.5)*2.+.12*c*x*x;
  vec4 img=p<.5?bA(u,.04*c):bB(u,.04*c);return mix(img,vec4(0.,0.,0.,1.),smoothstep(edge-.06,edge+.02,d));}`],
    ['rewind', 'cam', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*30.);vec2 v=u;v.x+=(h1(vec2(floor(u.y*70.),f))-.5)*.08*b;v.y+=b*.05*sin(p*40.);
  vec4 c=p<.5?rgbA(v,vec2(.012*b,0.)):rgbB(v,vec2(.012*b,0.));float g=dot(c.rgb,vec3(.3,.59,.11));c.rgb=mix(c.rgb,vec3(g),.6*b);
  c.rgb*=1.-.25*b*step(.5,fract(u.y*R.y/4.));return c;}`],
    ['stretchV', 'cam', stretch('y')], ['stretchH', 'cam', stretch('x')],
    ['panoL', 'cam', pano(1)], ['panoR', 'cam', pano(-1)],
    // blur
    ['blurMix', 'blur', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);return mix(bA(u,.06*b),bB(u,.06*b),smoothstep(.3,.7,p));}`],
    ['radialBlur', 'blur', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);return mix(zbA(u,.5*b),zbB(u,.5*b),smoothstep(.35,.65,p));}`],
    ['swing', 'blur', `vec4 tr(vec2 u){vec2 pv=vec2(.5,1.6);if(p<.5){float t=ei(p*2.);return sbA(rc(u,pv,-.5*t)+vec2(0.,0.),.25*t);}
  float t=1.-eo(p*2.-1.);return sbB(rc(u,pv,.5*t),.25*t);}`],
    ['blurDown', 'blur', `vec4 tr(vec2 u){float e=io(p),b=pow(sin(PI*p),3.);vec2 v=u+vec2(0.,e);vec2 d=vec2(0.,.45*b);return e<.5?dbA(v,d):dbB(v-vec2(0.,1.),d);}`],
    ['mosaic', 'blur', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float s=mix(1./R.y,.09,b*b);vec2 k=vec2(s/AS(),s);vec2 v=(floor(u/k)+.5)*k;return mixAB(v,smoothstep(.4,.6,p));}`],
    ['ink', 'blur', `vec4 tr(vec2 u){float n=fbm(sq(u)*5.);float e=p*1.25-.1;float m=smoothstep(e-.05,e,n);vec4 c=mix(TB(u),TA(u),m);
  float rim=smoothstep(.08,0.,abs(n-e+.02));return mix(c,vec4(0.,0.,0.,1.),rim*.7*sin(PI*p));}`],
    ['melt', 'blur', `vec4 tr(vec2 u){float e=ei(p);float dr=fbm(vec2(u.x*9.,1.))*.8+.2;vec2 v=u+vec2(0.,e*(1.3+dr*1.2));
  if(v.y>1.)return TB(u);return dbA(v,vec2(0.,.15*e));}`],
    ['grid', 'blur', `vec4 tr(vec2 u){vec2 n=vec2(4.,7.);vec2 c=floor(u*n);vec2 l=fract(u*n)-.5;float d=h1(c)*.5;float q=clamp((p-d*.8)/.55,0.,1.);
  float s=abs(1.-2.*io(q));if(s<.02)return bg(u);vec2 m=l/s;if(abs(m.x)>.5||abs(m.y)>.5)return bg(u);vec2 v=(c+.5+m)/n;return q<.5?TA(v):TB(v);}`],
    // glitch
    ['glitchBlock', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*22.);vec2 bl=floor(u*vec2(7.,22.));float r=h1(bl+f);
  vec2 v=u;if(r>1.-b*.7)v.x+=(h1(bl*1.7+f)-.5)*.25;vec2 d=vec2(.025*b,0.);float w=p+(h1(bl*3.1+f)-.5)*.5*b;return w<.5?rgbA(v,d):rgbB(v,d);}`],
    ['slices', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float row=floor(u.y*24.);float r=h1(vec2(row,7.));vec2 v=u+vec2((r-.5)*.6*b*b,0.);
  return p+(r-.5)*.3<.5?TA(v):TB(v);}`],
    ['digital', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 k=vec2(28./AS(),28.)*(1.-.75*b);vec2 c=floor(u*k);float r=h1(c+floor(p*14.));
  vec2 v=mix(u,(c+.5)/k,step(.85,b));vec4 col=r<p?TB(v):TA(v);col.rgb=mix(col.rgb,floor(col.rgb*6.)/6.,.5*b*b);return col;}`],
    ['vhs', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=u;float band=step(.92,fract(u.y*3.-p*4.));v.x+=band*.05*b+(vn(vec2(u.y*90.,p*50.))-.5)*.03*b;
  vec4 c=p<.5?rgbA(v,vec2(.02*b,0.)):rgbB(v,vec2(.02*b,0.));c.rgb+=(h1(u*R+p)-.5)*.1*b;return c;}`],
    ['smear', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float row=floor(u.y*80.);float on=step(.55,h1(vec2(row,floor(p*12.))));vec2 v=u;v.x=mix(u.x,floor(u.x*2.+h1(vec2(row,3.)))/2.,on*b);
  return p<.5?rgbA(v,vec2(.01*b,0.)):rgbB(v,vec2(.01*b,0.));}`],
    ['rgbSplit', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 d=vec2(.06,.015)*b*sign(sin(p*50.));vec2 v=zm(u,vec2(.5),1.+.1*b);return p<.5?rgbA(v,d):rgbB(v,d);}`],
    // light
    ['flash', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float w=pow(b,5.);vec4 c=p<.5?bA(u,.03*b):bB(u,.03*b);return vec4(mix(c.rgb*(1.+2.*w),vec3(1.),w),c.a);}`],
    ['leakWarm', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=mixAB(u,smoothstep(.35,.65,p));float g=exp(-pow((u.x+u.y*.4-(p*1.9-.4))*3.,2.));
  float n=fbm(u*2.+vec2(p*2.,0.));vec3 L=mix(vec3(1.,.42,.12),vec3(1.,.8,.45),n)*g*(.5+n)*b*1.1;return vec4(1.-(1.-c.rgb)*(1.-min(L,1.)),c.a);}`],
    ['leakPink', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=mixAB(u,smoothstep(.35,.65,p));float g=exp(-pow((length(u-vec2(1.,1.))-(p*1.8-.3))*2.,2.));
  float n=fbm(u*2.5-vec2(0.,p*2.));vec3 L=mix(vec3(1.,.25,.55),vec3(.6,.3,1.),n)*g*(.5+n)*b*1.2;return vec4(1.-(1.-c.rgb)*(1.-min(L,1.)),c.a);}`],
    ['flare', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=mixAB(u,smoothstep(.4,.6,p));float y=.5+.15*sin(p*3.);float s=exp(-abs(u.y-y)*60.)*(.4+.6*exp(-abs(u.x-p*1.4+.2)*3.));
  vec3 L=vec3(.55,.75,1.)*s*2.5*b+vec3(1.)*pow(b,4.)*.6;return vec4(c.rgb+L,c.a);}`],
    ['strobe', 'light', `vec4 tr(vec2 u){float k=floor(p*5.);float w=mod(k,2.);if(p>.8)w=1.;float fl=pow(1.-fract(p*5.),3.)*.35;vec4 c=X(u,w);return vec4(c.rgb+fl,c.a);}`],
    ['burn', 'light', `vec4 tr(vec2 u){float n=fbm(sq(u)*3.+vec2(0.,p));float e=p*1.3-.15;float d=e-n;vec4 c=d>0.?TB(u):TA(u);
  float rim=smoothstep(.12,0.,abs(d));vec3 hot=mix(vec3(1.,.35,.05),vec3(1.,.9,.6),smoothstep(.06,0.,abs(d)));c.rgb=mix(c.rgb,hot,rim*.95);if(d<0.&&d>-.2)c.rgb*=1.-(.2+d)*1.5;return c;}`],
    ['golden', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=mixAB(u,smoothstep(.4,.6,p));vec3 t=c.rgb*vec3(1.25,1.05,.75);return vec4(mix(c.rgb,1.-(1.-t)*(1.-t*b*1.5),b),c.a);}`],
    ['prism', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 d=(u-.5)*.06*b;vec2 v=zm(u,vec2(.5),1.+.15*b);vec4 c=mix(rgbA(v,d),rgbB(v,d),smoothstep(.4,.6,p));
  c.rgb+=vec3(sin(u.x*12.+p*9.),sin(u.x*12.+p*9.+2.),sin(u.x*12.+p*9.+4.))*.04*b;return c;}`],
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
    ['tiles', '3d', `vec4 tr(vec2 u){vec2 n=vec2(3.,5.);vec2 c=floor(u*n);vec2 l=fract(u*n);float q=clamp((p-(c.x+n.y-1.-c.y)/(n.x+n.y-2.)*.45)/.55,0.,1.);
  float k=abs(cos(PI*q));if(k<.02)return bg(u);float x=(l.x-.5)/k+.5;if(x<0.||x>1.)return bg(u);vec2 v=(c+vec2(x,l.y))/n;float sh=.6+.4*k;return (q<.5?TA(v):TB(v))*vec4(sh,sh,sh,1.);}`],
    ['panels', '3d', `vec4 tr(vec2 u){float i=floor(u.x*3.);float q=clamp((p-i*.12)/.64,0.,1.);float e=io(q);float sg=mod(i,2.)<.5?1.:-1.;float o=sg*(1.-e);
  vec2 v=u-vec2(0.,o);if(v.y>=0.&&v.y<=1.)return TB(v);float sh=1.-.45*smoothstep(.12,0.,abs(v.y-clamp(v.y,0.,1.)));return TA(u)*vec4(sh,sh,sh,1.);}`],
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
    ['pushZoom', 'slide', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);vec2 v=zm(u,vec2(.5),1.-.25*b)+vec2(e,0.);if(v.x<=1.)return TA(v);return TB(v-vec2(1.,0.));}`],
    // distortion
    ['ripple', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 q=sq(u);float r=length(q);vec2 v=u+normalize(q+1e-5)*sin(r*40.-p*30.)*.03*b/vec2(AS(),1.);return mixAB(v,smoothstep(.35,.65,p));}`],
    ['wave', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=u+vec2(sin(u.y*18.+p*12.),cos(u.x*14.+p*9.))*.045*b;return mixAB(v,smoothstep(.35,.65,p));}`],
    ['liquid', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=u+(vec2(fbm(u*3.+p*2.),fbm(u*3.+5.2-p*2.))-.5)*.35*b;return mixAB(v,smoothstep(.35,.65,p));}`],
    ['swirl', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float a=p<.5?7.*ei(p*2.):-7.*(1.-eo(p*2.-1.));vec2 v=twirl(u,a);return p<.5?zbA(v,.25*b):zbB(v,.25*b);}`],
    ['fisheye', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=bulge(u,3.*b);v=zm(v,vec2(.5),1.+.9*b);return mixAB(v,smoothstep(.42,.58,p));}`],
    ['pinch', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=bulge(u,-1.8*b);return mixAB(v,smoothstep(.42,.58,p));}`],
    ['kaleido', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 q=sq(u);float n=6.;float a=atan(q.y,q.x)+p*2.;float s=2.*PI/n;a=abs(mod(a,s)-s*.5);vec2 k=length(q)*vec2(cos(a),sin(a));
  vec2 v=mix(u,k/vec2(AS(),1.)+.5,smoothstep(.3,.95,b));return mixAB(v,smoothstep(.4,.6,p));}`],
    ['crack', 'warp', `vec2 cell(vec2 q,out float id){vec2 i=floor(q),f=fract(q);float md=9.;vec2 mc=vec2(0.);for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));
  vec2 o=vec2(h1(i+g),h1(i+g+9.));vec2 r=g+o-f;float d=dot(r,r);if(d<md){md=d;mc=i+g+o;}}id=h1(mc);return mc;}
vec4 tr(vec2 u){vec2 k=vec2(4.*AS(),4.);float id;vec2 c=cell(u*k,id);float q=clamp((p-.25-id*.25)/.5,0.,1.);if(p<.25){
  float id2;vec2 c2=cell(u*k+.02,id2);float edge=step(.001,length(c-c2));return TA(u)+vec4(vec3(edge*p*4.),0.);}
  vec2 m=(u*k-c)/(1.-q+.001)+c;float id3;vec2 c3=cell(m,id3);vec2 v=m/k+vec2(0.,-q*q*.6);if(q<1.&&length(c3-c)<.001&&inb(v))return TA(v)*vec4(vec3(1.-q*.5),1.);return TB(u);}`],
    // film: real-film looks (burns, leaks, leader, scribbles, dust) drawn in code over the cut
    ['fBurn', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(u,p);float n=fbm(vec2(u.x*1.5,u.y*2.5)+vec2(p*2.,0.));
  float x=u.x+(n-.5)*.6,e=1.25-1.7*p;float I=clamp(clamp((x-e)*1.6+.15,0.,1.)*clamp(b*1.6,0.,1.)+pow(b,6.)*.9,0.,1.);vec3 col=ramp(I);
  c.rgb=mix(scr(c.rgb,col*I),col,smoothstep(.55,1.,I));return film(c,u,b);}`],
    ['fRedLeak', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=p<.5?bA(u,.025*b):bB(u,.025*b);float n=fbm(vec2(u.x*3.,p*1.5));
  float band=.5+.5*sin(u.x*7.-p*9.+n*4.);float I=clamp(b*1.4*(band*.7+.3)*smoothstep(-.2,.8,u.x+p*.6-.3)+pow(b,8.)*.6,0.,1.);
  vec3 col=mix(vec3(.9,.05,.02),vec3(1.,.55,.1),band*I);c.rgb=scr(c.rgb*(1.-.35*I),col*I);return film(c,u,b*.6);}`],
    ['fPastel', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(u,p);float n=fbm(vec2(u.x*5.,u.y*.6+p));
  vec3 col=mix(vec3(1.,.62,.62),vec3(.85,.62,1.),smoothstep(.2,.8,u.x+n*.3));float st=exp(-pow((u.x-(.15+.5*p))*25.,2.))*b;
  float I=clamp(pow(b,.8)*(.55+.6*n),0.,1.);c.rgb=mix(c.rgb,scr(c.rgb,col),I);c.rgb=mix(c.rgb,vec3(1.,.95,.95),I*I*.6);
  c.rgb=scr(c.rgb,vec3(1.,.2,.3)*st);return film(c,u,b);}`],
    ['fBlue', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=p<.5?bA(u,.02*b):bB(u,.02*b);float s=exp(-pow((u.x*.9-u.y*.7-(p*2.4-1.))*2.5,2.));
  float l=exp(-abs(u.y-.56)*70.)*b;vec3 col=vec3(.35,.62,1.)*s*1.2+vec3(.4,.6,1.)*l+vec3(.7,.8,1.)*pow(b,3.)*.85;
  c.rgb=scr(c.rgb,col);return film(c,u,b*.5);}`],
    ['fBokeh', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(u,p);c.rgb=mix(c.rgb,c.rgb*vec3(.8,.66,.52)+vec3(.08,.05,.02),b);
  vec2 ce=mix(vec2(.15,1.25),vec2(.75,-.35),io(p));float r=.35+.75*pow(b,1.5);float m=smoothstep(r,r-.35,length(sq(u)-sq(ce)));
  c.rgb=mix(c.rgb,vec3(.96,.92,.86),m*.96);return film(c,u,b*.4);}`],
    ['fLeader', 'film', F + `vec4 tr(vec2 u){float fl=.85+.15*h1(vec2(floor(p*24.),3.));if(p<.18||p>.82){vec4 c=X(u,p);c.rgb*=fl;return film(c,u,.6);}
  float q=(p-.18)/.64,y=fract(u.y+q*3.);float fr=rr(vec2((u.x-.5)*AS(),y-.5),vec2(AS()*.5-.02,.44),.06);
  vec3 col=mix(vec3(.04),vec3(.97,.96,.93),smoothstep(.01,-.01,fr));float sx=u.x*AS();
  if(sx<.07){float hy=fract(u.y*5.+q*15.)-.5;col=mix(vec3(.03),vec3(.95),smoothstep(.004,-.004,rr(vec2(sx-.035,hy*.2),vec2(.018,.05),.01)));}
  col=mix(col,col*X(u,p).rgb,.18);return film(vec4(col*fl,1.),u,1.);}`],
    ['fStrip', 'film', F + `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float sc=1.-.14*smoothstep(0.,.3,b);float Y=u.y+e*1.12;float k=floor(Y/1.12),ly=Y-k*1.12;
  vec3 col=vec3(.02);float ax=abs(u.x-.5);
  if(ax<sc*.5){if(ly<1.){vec2 v=vec2(.5+(u.x-.5)/sc,ly);col=(k<.5?dbA(v,vec2(0.,.2*b)):dbB(v,vec2(0.,.2*b))).rgb;}}
  else{float hx=(ax-(sc*.5+.5)*.5)*AS(),hy=(fract(Y*4.)-.5)*.25;col=mix(col,vec3(.92,.9,.85),smoothstep(.003,-.003,rr(vec2(hx,hy),vec2(.008,.05),.008)));}
  return film(vec4(col,1.),u,b*.7);}`],
    ['fLeaderRed', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(u,p);float f=floor(p*12.);float L=dot(c.rgb,vec3(.3,.59,.11));
  vec3 col=vec3(.85,.12,.06)*(.25+L)+vec3(.1,0.,0.);vec2 ce=vec2(.5+.35*sin(f*2.1),.5+.25*cos(f*1.3));float d=length(sq(u)-sq(ce));
  col=mix(col,vec3(.02),smoothstep(.38,.37,d));col=scr(col,vec3(.3,1.,.85)*exp(-pow((d-.386)*300.,2.)));
  col*=.8+.4*h1(vec2(floor(p*24.),7.));float k=smoothstep(0.,.35,b);c.rgb=mix(c.rgb,col,k);return film(c,u,k);}`],
    ['fScribble', 'film', F + scrib('vec3(.93,.88,.1)')],
    ['fScribblePink', 'film', F + scrib('vec3(1.,.05,.6)')],
    ['fDust', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(u,p);float k=smoothstep(0.,.6,b);float L=dot(c.rgb,vec3(.3,.59,.11));
  c.rgb=mix(c.rgb,vec3(L*.25+.03),k);float f=floor(p*24.);float sc=exp(-abs(u.x-h1(vec2(f,1.)))*R.x*.7)*step(.4,h1(vec2(f,2.)));
  float d=step(.996,h1(floor(u*R/4.)+f*.71));
  float hair=exp(-pow((u.y-.3-.4*h1(vec2(f,5.))+sin(u.x*9.+f)*.05)*R.y*.4,2.))*step(.8,h1(vec2(f,6.)))*step(abs(u.x-h1(vec2(f,8.))),.15);
  c.rgb+=vec3(.9,.85,.7)*(sc*.7+d+hair)*k;c.rgb*=1.-.15*k+.3*h1(vec2(f,9.))*k;return film(c,u,k);}`],
    ['fEdge', 'film', F + `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float n=fbm(vec2(u.y*3.,p*3.));float d=u.x+(n-.5)*.25-(-.35+e*1.7);
  vec4 c=d<0.?TB(u):TA(u);vec3 col=vec3(1.,.98,.94)*exp(-pow(d*3.5,2.))+vec3(1.,.55,.1)*exp(-pow((d-.18)*9.,2.))*.8+vec3(.1,.45,.45)*exp(-pow((d+.2)*8.,2.))*.6;
  c.rgb=scr(c.rgb,col*min(1.,b*2.));return film(c,u,b);}`],
    ['fStreak', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=p<.5?dbA(u,vec2(0.,.04*b)):dbB(u,vec2(0.,.04*b));float y=.5+.03*sin(p*5.);
  float ln=exp(-abs(u.y-y)*40.)*(.5+.5*fbm(vec2(u.x*8.-p*6.,1.)));float bl=exp(-length(sq(u)-sq(vec2(-.1+1.2*p,y-.12)))*6.);
  vec3 col=vec3(1.,.72,.38)*ln*1.4*b+vec3(1.,.95,.85)*bl*b+vec3(.55,.32,.12)*pow(b,3.)*.6;c.rgb=scr(c.rgb*(1.-.4*b),col);
  c.rgb=mix(c.rgb,vec3(1.,.85,.6),pow(b,10.)*.85);return film(c,u,b*.5);}`],
    ['fAurora', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(u,p);vec2 q=u*vec2(2.,1.5)+vec2(p*.8,-p*.5);float a=fbm(q),g=fbm(q+5.2);
  vec3 col=mix(vec3(.45,.05,.4),vec3(.1,.75,.6),smoothstep(.35,.7,a));col=mix(col,vec3(.6,.9,.2),smoothstep(.62,.8,g)*.7);
  float I=pow(b,.7)*smoothstep(.2,.7,a+g*.4);vec3 base=c.rgb*(1.-.6*b);c.rgb=mix(base,scr(base,col*1.3),I);
  c.rgb=mix(c.rgb,col*.5,pow(b,6.)*.9);return film(c,u,b*.5);}`],
    ['fCard', 'film', F + `vec4 tr(vec2 u){float e=io(p);vec2 s=sq(u);float hw=AS()*.5+.2;float c=mix(-2.*hw-.3,2.*hw+.3,e);float x=s.x-s.y*.3,L=c-hw,Rr=c+hw;
  vec4 o=x<L?TB(u):TA(u);float m=smoothstep(L-.01,L+.01,x)*smoothstep(Rr+.01,Rr-.01,x);
  o.rgb=mix(o.rgb,vec3(.87)*(.94+.06*vn(u*R*.3)),m);o.rgb*=1.-smoothstep(.12,0.,abs(x-Rr-.04))*(1.-m)*.35;return o;}`],
    // seamless pack: zooms, spins, glitches, flats, perspective, stripes, glass, fades
    ['vZoomElastic', 'cam', G + `vec4 tr(vec2 u){if(p<.4){float t=ei(p/.4);return zbA(zm(u,vec2(.5),1.+2.*t),.5*t);}float t=(p-.4)/.6;
  return zbB(zm(u,vec2(.5),1.+.6*(1.-el(t))),.4*(1.-smoothstep(0.,.35,t)));}`],
    ['vZoomOptics', 'cam', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=zm(bulge(u,-2.5*b),vec2(.5),1.+1.5*b);return p<.5?zbA(v,.35*b):zbB(v,.35*b);}`],
    ['vZoomPixel', 'cam', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=zm(u,vec2(.5),1.+.8*b);float N=mix(500.,14.,pow(b,1.5));vec2 Gd=vec2(N*AS(),N);
  vec2 q=(floor(v*Gd)+.5)/Gd;return p<.5?zbA(q,.2*b):zbB(q,.2*b);}`],
    ['vSpinCorner', 'cam', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float a=e<.5?e*PI*.5:(e-1.)*PI*.5;vec4 s=vec4(0.);
  for(int i=0;i<12;i++){vec2 v=rc(u,vec2(0.),a+.3*b*(float(i)/11.-.5));s+=e<.5?TA(v):TB(v);}return s/12.;}`],
    ['vSpinElastic', 'cam', G + `vec4 tr(vec2 u){if(p<.4){float t=ei(p/.4);return sbA(rc(u,vec2(.5),t*PI*.5),.6*t);}float t=(p-.4)/.6;
  return sbB(rc(u,vec2(.5),-(1.-el(t))*PI*.5),.6*(1.-smoothstep(0.,.4,t)));}`],
    ['vCamFocus', 'cam', G + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float k=smoothstep(0.,.3,b),s=1.-.06*k;vec2 v=(u-.5)/s+.5;vec4 c=p<.5?bA(v,.05*b):bB(v,.05*b);
  c.rgb=mix(c.rgb,vec3(1.),pow(b,3.)*.7);vec2 q=(u-.5)*vec2(AS(),1.);c.rgb=mix(c.rgb,vec3(.05),smoothstep(0.,.003,rr(q,vec2(AS()*.5*s,.5*s),.03))*k);
  float ch=(step(abs(q.x),.0015)*step(abs(q.y),.04)+step(abs(q.y),.0015)*step(abs(q.x),.04))*b;c.rgb=mix(c.rgb,vec3(1.),ch*.7);return c;}`],
    ['vInvert', 'glitch', `vec4 tr(vec2 u){float f=floor(p*14.);float on=step(.25,p)*step(p,.8)*step(.35,h1(vec2(f,1.)));vec2 v=u+vec2((h1(vec2(f,2.))-.5)*.08*on,0.);
  vec4 c=X(v,p);if(on>.5)c.rgb=1.-c.rgb;return c;}`],
    ['vBadSignal', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*20.),row=floor(u.y*60.);
  float j=(h1(vec2(row,f))-.5)*.25*b*b*step(.6,h1(vec2(row*.3,f+3.)));vec2 v=u+vec2(j+sin(u.y*400.+p*90.)*.004*b,0.);vec4 c=X(v,p);
  float L=dot(c.rgb,vec3(.3,.59,.11));c.rgb=mix(c.rgb,vec3(L)*1.2+.1,smoothstep(.3,.9,b));c.rgb+=(h1(u*R+f)-.5)*.25*b;return c;}`],
    ['vTvNoise', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*30.);float n=h1(floor(u*R*.5)+f*1.7),s=smoothstep(.25,.75,b);
  vec4 c=X(u+vec2(0.,(h1(vec2(f,4.))-.5)*.1*s),p);c.rgb=mix(c.rgb,vec3(n)-step(.85,fract(u.y*3.+p*4.))*.25,s*.95);return c;}`],
    ['vAberr', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*16.),row=floor(u.y*24.);vec2 v=u+vec2((h1(vec2(row,f))-.5)*.3*b,0.),d=vec2(.03*b,0.),m=vec2(.2*b,0.);
  return p<.5?vec4(dbA(v+d,m).r,dbA(v,m).g,dbA(v-d,m).b,1.):vec4(dbB(v+d,m).r,dbB(v,m).g,dbB(v-d,m).b,1.);}`],
    ['vMagnify', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*12.);vec2 v=u;float hit=0.;
  for(int i=0;i<5;i++){float fi=float(i);vec2 c0=vec2(h1(vec2(f,fi)),h1(vec2(fi,f+1.))),hs=vec2(.08+.2*h1(vec2(f+fi,2.)),.03+.08*h1(vec2(f,fi+5.)));
    if(abs(u.x-c0.x)<hs.x&&abs(u.y-c0.y)<hs.y&&h1(vec2(fi,f*3.))<b){v=c0+(u-c0)/1.8+vec2(.05,0.);hit=1.;}}
  vec4 c=p<.5?rgbA(v,vec2(.012*b,0.)):rgbB(v,vec2(.012*b,0.));float bar=step(abs(u.y-h1(vec2(f,9.))),.006)*step(u.x,h1(vec2(f,10.)))*b;
  c.rgb=mix(c.rgb,vec3(1.,.55,.2),bar*.8)*(1.+.25*hit*b);return c;}`],
    ['vOffset', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*10.);float o=(h1(vec2(f,3.))-.5)*.8*b;float x=fract(u.x+o);vec2 v=vec2(x,u.y);
  vec4 c=p<.5?rgbA(v,vec2(.02*b,0.)):rgbB(v,vec2(.02*b,0.));c.rgb+=(exp(-x*200.)+exp(-(1.-x)*200.))*.3*b;return c;}`],
    ['vElastic', 'slide', flatE('el')],
    ['vBounce', 'slide', flatE('bo')],
    ['vSplit2', 'slide', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float sg=u.y>.5?1.:-1.;vec2 v=u+vec2(sg*e,0.),d=vec2(.2*b,0.);
  if(v.x>=0.&&v.x<=1.)return dbA(v,d);return dbB(v-vec2(sg,0.),d);}`],
    ['vPerspIn', '3d', persp(1, '.6')],
    ['vPerspOut', '3d', persp(-1, '-.4')],
    ['vStripesD', 'mask', stripes('.785', 7)],
    ['vStripesH', 'mask', stripes('0.', 8)],
    ['vStripesV', 'mask', stripes('1.5708', 8)],
    ['vGlass', 'warp', G + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 s=sq(u);vec2 d=vec2(.7071,-.7071);float band=floor(dot(s,vec2(-d.y,d.x))*3.5+100.);
  float t=clamp((p-.35*fract(band*.618))/.65,0.,1.),e=io(t),S=AS()*abs(d.x)+abs(d.y),x=dot(s,d),edge=mix(-S*.5-.15,S*.5+.15,e);
  vec2 off=d*(1.-e)*.35/vec2(AS(),1.);vec4 c=x<edge?rgbB(u+off,vec2(.008*sin(PI*t),0.)):TA(u-d*e*.05/vec2(AS(),1.));
  c.rgb+=exp(-abs(x-edge)*120.)*.6*sin(PI*t);return c;}`],
    ['vGlassBroken', 'warp', G + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 k=vec2(5.*AS(),5.);vec2 c=cell(u*k);vec2 v=u+(vec2(h1(c),h1(c+3.))-.5)*.25*b;
  float edge=step(.001,length(c-cell(u*k+.015)))*b;vec4 o=p<.5?rgbA(v,vec2(.01*b,0.)):rgbB(v,vec2(.01*b,0.));o.rgb+=edge*.5;return o;}`],
    ['vWarp', 'warp', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);vec2 v=vec2(.5+(u.x-.5)/(1.+3.*b)+e*2.,u.y+sin(u.x*12.+p*8.)*.03*b),d=vec2(.3*b,0.);
  return e<.5?dbA(v,d):dbB(v-vec2(2.,0.),d);}`],
    ['vExposure', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=p<.5?bA(u,.01*b):bB(u,.01*b);c.rgb=mix(c.rgb,1.-exp(-c.rgb*(1.+4.*pow(b,1.5))),smoothstep(0.,.3,b));
  c.rgb=mix(c.rgb,vec3(1.),pow(b,6.));return c;}`],
    ['vFadeBlur', 'blur', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=p<.5?bA(u,.05*b):bB(u,.05*b);c.rgb*=1.-b*b;return c;}`],
      // colour shapes (116 pack mogrts): flat layered wipes
    ['shDiag', 'shape', shape('(u.x*AS()+(1.-u.y)*.6)/(AS()+.6)', 'vec3(1.,.36,.18)', 'vec3(.95,.95,.93)', 'vec3(0.,.62,.66)')],
    ['shPill', 'shape', shape('(u.x+.12*(1.-sqrt(max(1.-4.*pow(fract(u.y*5.)-.5,2.),0.)))+h1(vec2(floor(u.y*5.),3.))*.25)/1.37', 'vec3(.12,.72,.5)', 'vec3(.6,.92,.76)', 'vec3(.97,.96,.88)')],
    ['shZig', 'shape', shape('((1.-u.y)+.12*abs(fract(u.x*AS()*4.)-.5))/1.06', 'vec3(.24,.27,.31)', 'vec3(0.,.62,.66)', 'vec3(.6,.9,.82)')],
    ['shSteps', 'shape', shape('(u.x+floor((1.-u.y)*5.)*.07)/1.3', 'vec3(.24,.27,.31)', 'vec3(.7,.86,.9)', 'vec3(.97,.95,.88)')],
    ['shArc', 'shape', shape('length(s-vec2(-AS()*.5,-.5))/length(vec2(AS(),1.))', 'vec3(.97,.95,.88)', 'vec3(1.,.42,.25)', 'vec3(.85,.25,.04)')],
    ['shCircle', 'shape', shape('length(s)/(.5*length(vec2(AS(),1.)))', 'vec3(.6,.9,.82)', 'vec3(.24,.27,.31)', 'vec3(0.,.62,.66)')],
    ['shBars', 'shape', shape('(u.y+h1(vec2(floor(u.x*6.),7.))*.35)/1.35', 'vec3(.97,.95,.88)', 'vec3(0.,.62,.66)', 'vec3(1.,.36,.18)')],
    ['shPyramid', 'shape', shape('(u.y+floor(abs(s.x)*7.)*.09)/(1.+floor(AS()*3.5)*.09)', 'vec3(.2,.3,.5)', 'vec3(.97,.95,.88)', 'vec3(.7,.86,.9)')],
    ['shSquare', 'shape', shape('(abs(rot(s,p*PI*.5).x)+abs(rot(s,p*PI*.5).y))/(.5*(AS()+1.))', 'vec3(.24,.27,.31)', 'vec3(0.,.62,.66)', 'vec3(1.,.36,.18)')],
    ['shChevron', 'shape', shape('(u.x+abs(u.y-.5)*.8)/1.4', 'vec3(.24,.27,.31)', 'vec3(.95,.95,.93)', 'vec3(.9,.1,.14)')],
    ['shStripes', 'shape', shape('((1.-u.y)+mod(floor((u.x*AS()+u.y)*5.),2.)*.3)/1.3', 'vec3(0.,.62,.66)', 'vec3(.95,.95,.93)', 'vec3(1.,.36,.18)')],
    // ink (116 pack): splash from a corner with drops, a drip from the top, and through black ink
    ['inkSpread', 'mask', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);vec2 s=sq(u);float n=fbm(s*3.+3.);float d=length(s-vec2(.15*AS(),.2))*.9-.55*n+.25;
  vec2 g=floor(s*14.);vec2 f=fract(s*14.)-.5-(vec2(h1(g),h1(g+4.))-.5)*.5;float dt=step(length(f),.08+.18*h1(g+9.))*step(.55,h1(g+2.));
  float th=e*1.6-.4;float m=max(1.-smoothstep(th-.04,th,d),dt*step(d-.35*h1(g+6.),th));
  float rim=(1.-smoothstep(0.,.12,abs(d-th)))*b;vec4 c=mix(TA(u),TB(u),m);c.rgb*=1.-.75*rim*(.5+.5*fbm(s*12.));return c;}`],
    ['inkDrip', 'mask', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float n=fbm(vec2(u.x*5.,p*1.5))*.18+vn(vec2(u.x*60.,1.))*.04*step(.6,vn(vec2(u.x*14.,3.)));
  float ed=(1.-u.y)-n,th=e*1.45-.25;float m=1.-smoothstep(th-.03,th,ed);float rim=(1.-smoothstep(0.,.1,abs(ed-th)))*b;
  vec4 c=mix(TA(u),TB(u),m);c.rgb*=1.-.6*rim*fbm(u*vec2(30.,8.));return c;}`],
    ['inkBlack', 'mask', `vec4 tr(vec2 u){vec2 s=sq(u);float q=p<.5?io(p*2.):1.-io(p*2.-1.);float n=fbm(s*2.5+(p<.5?1.:7.));float d=length(s)*.8-.6*n+.3,th=q*1.4-.35;
  float m=1.-smoothstep(th-.05,th,d);float rim=(1.-smoothstep(0.,.08,abs(d-th)))*step(.01,q)*step(q,.99);vec4 c=X(u,p);c.rgb=mix(c.rgb,vec3(.02),max(m,rim*.6));return c;}`],
    // pixel experts packs: echo trails, posterize, mirror bevels, turbulence, invert, hue shake, wave flashes
    ['pxEcho', 'blur', echo(false)],
    ['pxEchoInv', 'glitch', echo(true)],
    ['pxPoster', 'glitch', poster(false)],
    ['pxPosterRed', 'glitch', poster(true)],
    ['pxBevel', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=(u-.5)/(1.-.55*b)+.5;vec4 c=X(v,p);vec2 f=fract(v);
  float ed=min(min(f.x,1.-f.x)*AS(),min(f.y,1.-f.y));float k=1.-(1.-smoothstep(.0,.05,ed))*smoothstep(0.,.15,b);c.rgb*=mix(.35,1.,k)+(1.-k)*.5*(f.x+f.y-1.);
  c.rgb=mix(c.rgb,c.rgb*vec3(1.15,.95,1.1),b);return c;}`],
    ['pxTurb', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*18.);vec2 q=u*vec2(AS(),1.)*3.+f*.37;vec2 d=(vec2(fbm(q),fbm(q+5.2))-.5)*.35*b*b;
  return p<.5?rgbA(u+d,d*.15):rgbB(u+d,d*.15);}`],
    ['pxBlurInv', 'blur', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=p<.5?bA(u,.06*b):bB(u,.06*b);c.rgb=mix(c.rgb,1.-c.rgb,smoothstep(.35,.5,p)*(1.-smoothstep(.5,.65,p)));return c;}`],
    ['pxHueShake', 'cam', PX + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*24.);vec2 o=(vec2(h1(vec2(f,1.)),h1(vec2(f,2.)))-.5)*.08*b;vec2 v=zm(u+o,vec2(.5),1.+.1*b);
  vec4 c=p<.5?dbA(v,o*.6):dbB(v,o*.6);c.rgb=clamp(hue(c.rgb,b*PI*1.5*(h1(vec2(f,5.))>.5?1.:-1.)),0.,1.);return c;}`],
    ['pxWaveFlash', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(u+vec2(sin(u.y*20.+p*30.)*.03*b,0.),p);c.rgb=mix(c.rgb,vec3(1.),step(.6,h1(vec2(floor(p*14.),2.)))*b*.7);return c;}`],
    // glitch presets (116 pack): black stutter, emboss, rgb centre warp, colour ghosts, cyan blocks
    ['gStutter', 'glitch', `vec4 tr(vec2 u){float blk=step(.3,p)*step(p,.5)*mod(floor(p*16.),2.);vec2 v=zm(u,vec2(.5),1.+(p>.5?.25*(1.-eo((p-.5)*2.)):0.));vec4 c=X(v,p);c.rgb*=1.-blk;return c;}`],
    ['gEmboss', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 d=vec2(2./R.x,2./R.y)*(1.+6.*b);vec4 c=X(u,p);vec4 e=X(u+d,p)-X(u-d,p);
  float on=step(.4,h1(vec2(floor(p*14.),4.)))*smoothstep(.1,.5,b);c.rgb=mix(c.rgb,(.5+e.rgb*2.)*vec3(.9,1.,1.1),on);return c;}`],
    ['gRgbWarp', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=bulge(u,.8*b);float k=.25*b;
  return p<.5?vec4(zbA(v,k*1.4).r,zbA(v,k).g,zbA(v,k*.6).b,1.):vec4(zbB(v,k*1.4).r,zbB(v,k).g,zbB(v,k*.6).b,1.);}`],
    ['gGhost', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*12.);vec2 o=vec2(.04+.04*h1(vec2(f,1.)),.02*(h1(vec2(f,2.))-.5))*b;
  vec4 c=X(u,p);vec3 g1=X(u+o,p).rgb,g2=X(u-o,p).rgb;c.rgb=c.rgb*(1.-.4*b)+(g1*vec3(0.,.4,.2)+g2*vec3(.4,0.,.2))*b;return c;}`],
    ['gCyan', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*15.);vec2 bl=floor(u*vec2(6.,14.));float on=step(.55,h1(bl+f))*b;
  vec4 c=X(u+vec2((h1(bl+f+3.)-.5)*.2*on,0.),p);c.rgb=mix(c.rgb,vec3(0.,.9,1.)*dot(c.rgb,vec3(.3,.59,.11))*1.5,on*.8);c.rgb*=1.-.08*b*step(.5,fract(u.y*R.y*.25));return c;}`],
    // tech nestology 1000+ pack
    ['nBoxBounce', '3d', G + cubeV(1).replace('io(p)', 'bo(p)')],
    ['nBoxSwing', '3d', G + cubeV(1).replace('io(p)', 'bk(p)')],
    ['nHeart', 'mask', dshape('pow(dot(q*2.,q*2.)-1.,3.)-q.x*q.x*4.*q.y*q.y*q.y*8.<0.', '3.5')],
    ['nArrow', 'mask', dshape('(abs(q.y+0.)<.25&&q.x+(1.-e)*.3>-.8&&q.x<.1)||(q.x>=-.1&&abs(q.y)<(.9-q.x)*.9)', '6.')],
    ['nBlocks', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 g=floor(u*vec2(5.,8.));float off=(h1(g+2.)-.5)*.4*b*step(.3,h1(g+5.));vec2 v=u+vec2(off,0.);
  return p>h1(g)*.6+.2?TB(v):TA(v);}`],
    ['nBevel', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 s=sq(u);float y=dot(s,vec2(-.6,.8))*7.,bd=floor(y);float off=(h1(vec2(bd,2.))-.5)*.5*b;
  vec2 v=u+vec2(.8,.6)*off/vec2(AS(),1.);vec4 c=p>.2+.6*h1(vec2(bd,1.))?TB(v):TA(v);c.rgb*=1.-.35*b*smoothstep(.8,1.,fract(y));return c;}`],
    ['nMonitor', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*14.),row=floor(u.y*30.);float r=h1(vec2(row,f));
  vec4 c=X(u+vec2((h1(vec2(row,f+7.))-.5)*.3*b*step(.5,r),0.),p);vec3 col=r>.92?vec3(1.,.1,.1):r>.84?vec3(.1,1.,.2):vec3(.15,.2,1.);
  c.rgb=mix(c.rgb,col*(.4+c.rgb),step(.75,r)*b*.85);c.rgb*=1.-.15*b*step(.5,fract(u.y*R.y*.5));return c;}`],
    ['nSatellite', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float s=smoothstep(.2,.6,b),f=floor(p*24.),ry=floor(u.y*16.);
  float n=h1(floor(u*vec2(80.,45.)*vec2(1.,.4+.6*h1(vec2(floor(u.y*12.),f))))+f*3.1);vec3 sn=mix(vec3(n)*vec3(.9,.8,1.)*.7,vec3(.9,.2,.8)*n,step(.93,h1(vec2(floor(u.y*40.),f))));
  vec4 c=X(u+vec2((h1(vec2(floor(u.y*20.),f))-.5)*.1*s,0.),p);c.rgb=mix(c.rgb*(1.-.7*s),sn,s*step(.3,h1(vec2(ry,f+1.))));return c;}`],
    ['n3dPan', '3d', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float h=AS();vec3 e1=rx(ry(vec3(1.,0.,0.),.35*b),.5*b),e2=rx(vec3(0.,1.,0.),.5*b);
  vec3 A=card(u,vec3(-e*2.2*h,.3*b,.6*b),e1,e2),B=card(u,vec3((1.-e)*2.2*h,.3*b,.6*b),e1,e2);
  if(A.z>0.)return dbA(A.xy,vec2(.1*b,0.));if(B.z>0.)return dbB(B.xy,vec2(.1*b,0.));return bg(u);}`],
    ['nFlight', 'blur', N + `vec4 tr(vec2 u){vec2 c=vec2(1.1,1.05);float t=p<.5?ei(p*2.):1.-eo(p*2.-1.);vec2 v=zm(u,c,1.+2.5*t)+vec2(-.25,-.2)*(p<.5?t:-t);return zc(v,c,.6*t,p>=.5);}`],
    ['shRings', 'shape', shape('length(s)/(.5*length(vec2(AS(),1.)))*.85+.15*step(.5,fract(atan(s.y,s.x)/6.2832*2.+p*1.5))', 'vec3(.45,.75,.65)', 'vec3(1.,.6,.3)', 'vec3(0.,.85,1.)')],
    ['shRhomb', 'shape', shape('((1.-u.y)-.4*(1.-2.*abs(u.x-.5))+.4)/1.4', 'vec3(.97,.95,.88)', 'vec3(.15,.15,.17)', 'vec3(.96,.33,.3)')],
    ['nFrost', 'mask', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 s=sq(u);float n=fbm(s*6.+fbm(s*3.)*2.);float cr=pow(fbm(s*24.+n*4.),3.),b3=b*b*b;
  vec4 c=mixAB(u+(n-.5)*.03*b,smoothstep(.45,.6,p));float m=smoothstep(0.,.25,b3*1.3-(1.-n)*.8);c.rgb=mix(c.rgb,vec3(.75,.88,.95)*(.4+.6*n)+cr*.4,m);return c;}`],
    ['nTarget', 'cam', N + `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);vec2 c=vec2(.68,.62);return zc(zm(u,c,1.+5.*t),c,.4*t,false);}
  float t=1.-eo(p*2.-1.);vec2 c=vec2(.4,.45);return zc(zm(u,c,1.+5.*t),c,.4*t,true);}`],
    ['nTunnel', 'warp', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float k=.98*b+.001;float xs=asin(clamp((u.x-.5)*2.*k,-1.,1.))/asin(k)*.5;
  vec2 v=vec2(.5+xs+e*2.,u.y),d=vec2(.35*b,0.);vec4 c=e<.5?dbA(v,d):dbB(v-vec2(2.,0.),d);c.rgb*=1.-.5*b*pow(abs(u.x-.5)*2.,2.);return c;}`],
    ['nTilt', 'cam', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);vec2 c=u-.5;c.x*=1.+.5*b*c.y;vec2 v=c+.5+vec2(0.,e),d=vec2(0.,.3*b);return e<.5?dbA(v,d):dbB(v-vec2(0.,1.),d);}`],
    ['nVrRotate', 'warp', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);vec2 s=sq(u);vec2 pl=vec2(fract(atan(s.y,s.x)/6.2832+.5+e),clamp(length(s)*1.2,0.,1.));
  return X(mix(u,pl,smoothstep(0.,.6,b)),p);}`],
    ['nVrStretch', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=u+vec2(sin(u.y*7.+p*9.)*.12,sin(u.x*5.+p*4.)*.06)*b,d=vec2(.5*b,.1*b),o=vec2(.04*b,0.);
  vec4 c=p<.5?vec4(dbA(v+o,d).r,dbA(v,d).g,dbA(v-o,d).b,1.):vec4(dbB(v+o,d).r,dbB(v,d).g,dbB(v-o,d).b,1.);c.rgb=mix(c.rgb,1.-(1.-c.rgb)*.7,b*.5);return c;}`],
    ['nVrBend', 'warp', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);vec2 v=vec2(u.x+e*2.,u.y+sin(u.x*PI*2.+e*6.)*.12*b),d=vec2(.3*b,.05*b),o=vec2(.03*b,0.);
  if(e<.5)return vec4(dbA(v+o,d).r,dbA(v,d).g,dbA(v-o,d).b,1.);v.x-=2.;return vec4(dbB(v+o,d).r,dbB(v,d).g,dbB(v-o,d).b,1.);}`],
    ['nVrRay', 'light', N + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 s=sq(u);vec4 c=zc(u,vec2(.5,.45),.5*b,p>=.5);c.rgb+=b*b*vec3(1.,.95,.7)*.6;
  c.rgb*=mix(vec3(1.),.7+.3*cos(vec3(0.,2.,4.)+atan(s.y,s.x)*3.),b*.6);return c;}`],
    ['nVrZoom', 'light', N + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=zc(bulge(u,3.*b),vec2(.5),.3*b,p>=.5);c.rgb+=exp(-length(sq(u))*4./(b+.01))*b*1.5;
  c.rgb=mix(c.rgb,vec3(1.),pow(b,4.)*.8);return c;}`],
];
  const CATS = ['cam', 'blur', 'glitch', 'light', 'film', 'shape', '3d', 'mask', 'slide', 'warp'];
  const MAIN = '\nvoid main(){R=(D>.5&&D<1.5)||D>2.5?RR.yx:RR;gl_FragColor=tr(dfwd(uv0));}';
  // easing of the transition's progress (all stay inside 0..1, which every shader expects)
  const EASES = ['lin', 'smooth', 'hit', 'soft', 'bounce', 'short'];
  const bounce = x => x < 1 / 2.75 ? 7.5625 * x * x : x < 2 / 2.75 ? 7.5625 * (x -= 1.5 / 2.75) * x + .75 : x < 2.5 / 2.75 ? 7.5625 * (x -= 2.25 / 2.75) * x + .9375 : 7.5625 * (x -= 2.625 / 2.75) * x + .984375;
  const ease = (k, q) => { q = Math.min(1, Math.max(0, q));
    return k === 'smooth' ? q * q * (3 - 2 * q) : k === 'hit' ? 1 - (1 - q) ** 3 : k === 'soft' ? q * q : k === 'bounce' ? bounce(q) : k === 'short' ? Math.min(1, Math.max(0, (q - .25) * 2)) : q; };
  const api = { HEAD, MAIN, EASES, ease, LIST, CATS, ids: LIST.map(x => x[0]), cat: Object.fromEntries(LIST.map(x => [x[0], x[1]])) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KadrGLT = api;
})(this);
