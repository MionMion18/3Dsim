import * as CANNON from 'cannon-es';

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.81, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;

    // マテリアル定義
    this.defaultMaterial = new CANNON.Material('default');
    this.loadMaterial = new CANNON.Material('load');

    const contact = new CANNON.ContactMaterial(
      this.defaultMaterial,
      this.loadMaterial,
      { friction: 0.5, restitution: 0.1 }
    );
    this.world.addContactMaterial(contact);
    this.world.defaultContactMaterial.friction = 0.3;

    this.bodies = [];
  }

  step(dt) {
    this.world.step(1 / 60, dt, 3);
  }

  createBox(halfExtents, position, mass = 0, material = null) {
    const shape = new CANNON.Box(new CANNON.Vec3(...halfExtents));
    const body = new CANNON.Body({
      mass,
      material: material || this.defaultMaterial,
    });
    body.addShape(shape);
    body.position.set(...position);
    if (mass === 0) body.type = CANNON.Body.STATIC;
    this.world.addBody(body);
    this.bodies.push(body);
    return body;
  }

  createCylinder(radiusTop, radiusBottom, height, segments, position, mass = 0) {
    const shape = new CANNON.Cylinder(radiusTop, radiusBottom, height, segments);
    const body = new CANNON.Body({ mass });
    body.addShape(shape);
    body.position.set(...position);
    if (mass === 0) body.type = CANNON.Body.STATIC;
    this.world.addBody(body);
    this.bodies.push(body);
    return body;
  }

  removeBody(body) {
    this.world.removeBody(body);
    this.bodies = this.bodies.filter(b => b !== body);
  }
}
