import * as THREE from 'three';

export function createDreamweaveWorld(scene, playerRig) {
  scene.add(new THREE.HemisphereLight(0x8bd8ff, 0x201812, 1.15));

  const sun = new THREE.DirectionalLight(0xffd28a, 2.4);
  sun.position.set(-6, 12, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 25;
  sun.shadow.camera.bottom = -25;
  scene.add(sun);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(10.5, 12.2, 1.1, 96),
    new THREE.MeshStandardMaterial({ color: 0x293543, metalness: 0.22, roughness: 0.48 })
  );
  platform.position.y = -0.55;
  platform.receiveShadow = true;
  platform.castShadow = true;
  scene.add(platform);

  const ringMat = new THREE.MeshStandardMaterial({ color: 0x45d0c1, emissive: 0x123d3b, metalness: 0.45, roughness: 0.32 });
  for (let i = 0; i < 3; i += 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(11.4 + i * 1.2, 0.045, 8, 160), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05 + i * 0.03;
    scene.add(ring);
  }

  const anchor = createAnchorModel();
  scene.add(anchor);

  const towerMat = new THREE.MeshStandardMaterial({ color: 0x1b2635, metalness: 0.3, roughness: 0.5 });
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xf5bd56 });
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const radius = 18 + (i % 3) * 4;
    const height = 4 + (i % 4) * 1.6;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.8, height, 1.8), towerMat);
    tower.position.set(Math.cos(angle) * radius, height / 2 - 0.5, Math.sin(angle) * radius);
    tower.rotation.y = -angle;
    tower.castShadow = true;
    tower.receiveShadow = true;
    scene.add(tower);

    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.06), windowMat);
    glow.position.set(tower.position.x, height * 0.58, tower.position.z);
    glow.rotation.y = tower.rotation.y;
    scene.add(glow);
  }

  scene.add(createStarfield());
  playerRig.add(createAvatarModel());

  return { anchor };
}

export function updateDreamweaveWorld(world, elapsedTime) {
  if (!world.anchor) return;
  world.anchor.rotation.y = elapsedTime * 0.55;
  world.anchor.userData.halo.rotation.z = elapsedTime * 0.9;
  world.anchor.position.y = 2.05 + Math.sin(elapsedTime * 1.4) * 0.16;
}

function createAnchorModel() {
  const anchor = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.35, 1),
    new THREE.MeshStandardMaterial({ color: 0x7df7e9, emissive: 0x1a6e69, metalness: 0.18, roughness: 0.2 })
  );
  core.castShadow = true;
  anchor.add(core);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.035, 8, 128), new THREE.MeshBasicMaterial({ color: 0xf5bd56 }));
  halo.rotation.x = Math.PI / 2;
  anchor.add(halo);

  anchor.position.set(0, 2.05, 0);
  anchor.name = 'anchor';
  anchor.userData.halo = halo;
  return anchor;
}

function createAvatarModel() {
  const avatar = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.36, 0.85, 8, 18),
    new THREE.MeshStandardMaterial({ color: 0xe8f4ff, roughness: 0.42 })
  );
  body.castShadow = true;
  body.position.y = 0.55;

  const scarf = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.055, 8, 32, Math.PI * 1.4),
    new THREE.MeshStandardMaterial({ color: 0xf5bd56, emissive: 0x332006, roughness: 0.35 })
  );
  scarf.position.y = 1.05;
  scarf.rotation.x = Math.PI / 2;
  avatar.add(body, scarf);
  return avatar;
}

function createStarfield() {
  const starGeo = new THREE.BufferGeometry();
  const starPositions = [];
  for (let i = 0; i < 800; i += 1) {
    const radius = 70 + Math.random() * 120;
    const theta = Math.random() * Math.PI * 2;
    const y = 10 + Math.random() * 80;
    starPositions.push(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  return new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdceeff, size: 0.16, sizeAttenuation: true }));
}
