import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/scrapers/run (POST)', () => {
    return request(app.getHttpServer())
      .post('/scrapers/run')
      .expect(201)
      .expect((res) => {
        expect(res.body.status).toBe('success');
        expect(res.body.discoveredCount).toBeGreaterThan(0);
        expect(res.body.message).toContain('Discovered and processed');
      });
  }, 35000);

  afterEach(async () => {
    await app.close();
  });
});
