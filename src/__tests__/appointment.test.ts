import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import '../__tests__/setup';

const prisma = new PrismaClient();

describe('Appointment Routes', () => {
  // Test data
  const testService = {
    title: 'Test Service',
    description: 'This is a test service',
    price: 99.99,
  };

  const testAppointment = {
    clientFirstName: 'John',
    clientLastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '1234567890',
    date: new Date(Date.now() + 25 * 60 * 60 * 1000), // 25 hours from now
  };

  let createdServiceId: string;

  beforeEach(async () => {
    // Create a service first since appointments require a service
    const service = await prisma.service.create({
      data: testService,
    });
    createdServiceId = service.id;
  });

  describe('POST /api/appointments', () => {
    it('should create a new appointment with a valid service', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .send({
          ...testAppointment,
          serviceId: createdServiceId,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.clientFirstName).toBe(testAppointment.clientFirstName);
      expect(response.body.clientLastName).toBe(testAppointment.clientLastName);
      expect(response.body.email).toBe(testAppointment.email);
      expect(response.body.serviceId).toBe(createdServiceId);
      expect(response.body.states).toBe('pending'); // Initial state before payment
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .send({
          clientFirstName: 'John',
          // Missing other required fields
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 if service does not exist', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .send({
          ...testAppointment,
          serviceId: '00000000-0000-0000-0000-000000000000', // Valid UUID format but non-existent
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/appointments', () => {
    it('should return all appointments', async () => {
      // First create an appointment
      await prisma.appointment.create({
        data: {
          ...testAppointment,
          serviceId: createdServiceId,
        },
      });

      const response = await request(app)
        .get('/api/appointments')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('clientFirstName');
    });
  });

  describe('GET /api/appointments/:id', () => {
    it('should return a specific appointment', async () => {
      // First create an appointment
      const createdAppointment = await prisma.appointment.create({
        data: {
          ...testAppointment,
          serviceId: createdServiceId,
        },
      });

      const response = await request(app)
        .get(`/api/appointments/${createdAppointment.id}`)
        .expect(200);

      expect(response.body.id).toBe(createdAppointment.id);
      expect(response.body.clientFirstName).toBe(testAppointment.clientFirstName);
    });

    it('should return 404 if appointment not found', async () => {
      const response = await request(app)
        .get('/api/appointments/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/appointments/:id', () => {
    it('should update an appointment', async () => {
      // First create an appointment
      const createdAppointment = await prisma.appointment.create({
        data: {
          ...testAppointment,
          serviceId: createdServiceId,
        },
      });

      const updatedData = {
        clientFirstName: 'Jane',
        clientLastName: 'Smith',
        email: 'jane.smith@example.com',
        phone: '9876543210',
        date: new Date(Date.now() + 26 * 60 * 60 * 1000), // 26 hours from now
      };

      const response = await request(app)
        .put(`/api/appointments/${createdAppointment.id}`)
        .send(updatedData)
        .expect(200);

      expect(response.body.clientFirstName).toBe(updatedData.clientFirstName);
      expect(response.body.clientLastName).toBe(updatedData.clientLastName);
      expect(response.body.email).toBe(updatedData.email);
    });

    it('should update appointment state after payment', async () => {
      // First create an appointment
      const createdAppointment = await prisma.appointment.create({
        data: {
          ...testAppointment,
          serviceId: createdServiceId,
        },
      });

      // Simulate payment confirmation
      const response = await request(app)
        .put(`/api/appointments/${createdAppointment.id}/confirm`)
        .send({
          appointmentId: createdAppointment.id,
          paymentStatus: 'completed',
        })
        .expect(200);

      expect(response.body.states).toBe('confirmed');
    });
  });

  describe('DELETE /api/appointments/:id', () => {
    it('should delete an appointment', async () => {
      // First create an appointment
      const createdAppointment = await prisma.appointment.create({
        data: {
          ...testAppointment,
          serviceId: createdServiceId,
        },
      });

      await request(app)
        .delete(`/api/appointments/${createdAppointment.id}`)
        .expect(204);

      // Verify the appointment is deleted
      const deletedAppointment = await prisma.appointment.findUnique({
        where: { id: createdAppointment.id },
      });

      expect(deletedAppointment).toBeNull();
    });
  });
}); 