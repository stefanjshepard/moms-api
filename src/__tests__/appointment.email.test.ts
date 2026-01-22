// Mock the email service BEFORE importing app
jest.mock('../services/email.service', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  verifyEmailConfig: jest.fn().mockResolvedValue(true),
}));

import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from '../services/email.service';
import '../__tests__/setup';

const prisma = new PrismaClient();
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

describe('Appointment Email Integration', () => {
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
    date: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(), // 25 hours from now
  };

  let createdServiceId: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Create a service first since appointments require a service
    const service = await prisma.service.create({
      data: testService,
    });
    createdServiceId = service.id;
  });

  describe('POST /api/appointments - Confirmation Email', () => {
    it('should send confirmation email when appointment is created', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .send({
          ...testAppointment,
          serviceId: createdServiceId,
        })
        .expect(201);

      expect(response.body.id).toBeDefined();

      // Wait longer for async email to be sent
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify email was sent
      expect(mockSendEmail).toHaveBeenCalled();
      expect(mockSendEmail).toHaveBeenCalledWith(
        testAppointment.email,
        'Appointment Confirmation',
        expect.stringContaining(testAppointment.clientFirstName)
      );
    });

    it('should include appointment details in confirmation email', async () => {
      await request(app)
        .post('/api/appointments')
        .send({
          ...testAppointment,
          serviceId: createdServiceId,
        })
        .expect(201);

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(mockSendEmail).toHaveBeenCalled();
      const emailCall = mockSendEmail.mock.calls[0];
      expect(emailCall).toBeDefined();
      const emailHtml = emailCall[2] as string;

      expect(emailHtml).toContain(testAppointment.clientFirstName);
      expect(emailHtml).toContain(testService.title);
      expect(emailHtml).toContain('Pending Confirmation');
    });

    it('should not fail if email sending fails', async () => {
      mockSendEmail.mockRejectedValueOnce(new Error('Email send failed'));

      const response = await request(app)
        .post('/api/appointments')
        .send({
          ...testAppointment,
          serviceId: createdServiceId,
        })
        .expect(201);

      // Appointment should still be created
      expect(response.body.id).toBeDefined();
    });
  });

  describe('PUT /api/appointments/:id - Reschedule Email', () => {
    it('should send reschedule email when appointment date is changed', async () => {
      // Create an appointment
      const appointment = await prisma.appointment.create({
        data: {
          ...testAppointment,
          date: new Date(testAppointment.date),
          serviceId: createdServiceId,
        },
        include: { service: true },
      });

      const newDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours from now

      await request(app)
        .put(`/api/appointments/${appointment.id}`)
        .send({
          date: newDate,
        })
        .expect(200);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify reschedule email was sent
      expect(mockSendEmail).toHaveBeenCalledWith(
        testAppointment.email,
        'Appointment Rescheduled',
        expect.stringContaining('Appointment Rescheduled')
      );
    });

    it('should not send reschedule email if date is unchanged', async () => {
      const appointment = await prisma.appointment.create({
        data: {
          ...testAppointment,
          date: new Date(testAppointment.date),
          serviceId: createdServiceId,
        },
      });

      await request(app)
        .put(`/api/appointments/${appointment.id}`)
        .send({
          clientFirstName: 'Jane', // Only updating name, not date
        })
        .expect(200);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should not send reschedule email
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should include old and new dates in reschedule email', async () => {
      const oldDate = new Date(testAppointment.date);
      const appointment = await prisma.appointment.create({
        data: {
          ...testAppointment,
          date: oldDate,
          serviceId: createdServiceId,
        },
        include: { service: true },
      });

      const newDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      await request(app)
        .put(`/api/appointments/${appointment.id}`)
        .send({ date: newDate })
        .expect(200);

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(mockSendEmail).toHaveBeenCalled();
      const emailCall = mockSendEmail.mock.calls[0];
      expect(emailCall).toBeDefined();
      const emailHtml = emailCall[2] as string;

      expect(emailHtml).toContain('Previous Date');
      expect(emailHtml).toContain('New Date & Time');
    });
  });

  describe('PUT /api/appointments/:id/confirm - Confirmed Email', () => {
    it('should send confirmed email when appointment is confirmed after payment', async () => {
      const appointment = await prisma.appointment.create({
        data: {
          ...testAppointment,
          date: new Date(testAppointment.date),
          serviceId: createdServiceId,
        },
        include: { service: true },
      });

      await request(app)
        .put(`/api/appointments/${appointment.id}/confirm`)
        .send({
          appointmentId: appointment.id,
          paymentStatus: 'completed',
        })
        .expect(200);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify confirmed email was sent
      expect(mockSendEmail).toHaveBeenCalledWith(
        testAppointment.email,
        'Appointment Confirmed!',
        expect.stringContaining('Appointment Confirmed!')
      );
    });

    it('should include confirmed status in email', async () => {
      const appointment = await prisma.appointment.create({
        data: {
          ...testAppointment,
          date: new Date(testAppointment.date),
          serviceId: createdServiceId,
        },
        include: { service: true },
      });

      await request(app)
        .put(`/api/appointments/${appointment.id}/confirm`)
        .send({
          appointmentId: appointment.id,
          paymentStatus: 'completed',
        })
        .expect(200);

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(mockSendEmail).toHaveBeenCalled();
      const emailCall = mockSendEmail.mock.calls[0];
      expect(emailCall).toBeDefined();
      const emailHtml = emailCall[2] as string;

      expect(emailHtml).toContain('Confirmed');
      expect(emailHtml).toContain('Status:</strong> Confirmed');
    });
  });

  describe('DELETE /api/appointments/:id - Cancellation Email', () => {
    it('should send cancellation email when appointment is deleted', async () => {
      const appointment = await prisma.appointment.create({
        data: {
          ...testAppointment,
          date: new Date(testAppointment.date),
          serviceId: createdServiceId,
        },
        include: { service: true },
      });

      await request(app)
        .delete(`/api/appointments/${appointment.id}`)
        .expect(204);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify cancellation email was sent
      expect(mockSendEmail).toHaveBeenCalledWith(
        testAppointment.email,
        'Appointment Cancelled',
        expect.stringContaining('Appointment Cancelled')
      );
    });

    it('should include appointment details in cancellation email', async () => {
      const appointment = await prisma.appointment.create({
        data: {
          ...testAppointment,
          date: new Date(testAppointment.date),
          serviceId: createdServiceId,
        },
        include: { service: true },
      });

      await request(app)
        .delete(`/api/appointments/${appointment.id}`)
        .expect(204);

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(mockSendEmail).toHaveBeenCalled();
      const emailCall = mockSendEmail.mock.calls[0];
      expect(emailCall).toBeDefined();
      const emailHtml = emailCall[2] as string;

      expect(emailHtml).toContain(testAppointment.clientFirstName);
      expect(emailHtml).toContain(testService.title);
      expect(emailHtml).toContain('Cancelled Appointment Details');
    });

    it('should not fail if email sending fails during deletion', async () => {
      mockSendEmail.mockRejectedValueOnce(new Error('Email send failed'));

      const appointment = await prisma.appointment.create({
        data: {
          ...testAppointment,
          date: new Date(testAppointment.date),
          serviceId: createdServiceId,
        },
      });

      // Should still delete the appointment
      await request(app)
        .delete(`/api/appointments/${appointment.id}`)
        .expect(204);
    });
  });
});
