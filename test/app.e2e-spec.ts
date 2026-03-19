import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('CredFX API (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
n the 
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/fx/rates should return 401 without token', () => {
    return request(httpServer).get('/api/v1/fx/rates').expect(401);
  });

  it('POST /api/v1/auth/register should return 400 on invalid body', () => {
    return request(httpServer)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: '123' })
      .expect(400);
  });

  it('POST /api/v1/auth/login should return 401 on wrong credentials', () => {
    return request(httpServer)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.com', password: 'wrongpass' })
      .expect(401);
  });
});
