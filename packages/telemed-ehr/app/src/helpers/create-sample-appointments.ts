import { APIGatewayProxyResult } from 'aws-lambda';
import { DateTime } from 'luxon';
import { FhirClient, SearchParam } from '@zapehr/sdk';
import { PersonSex } from '../../../app/src/types/types';
import { Patient, Practitioner } from 'fhir/r4';
import { getSelectors } from '../shared/store/getSelectors';
import { useTrackingBoardStore } from '../telemed';
import { allLicensesForPractitioner, User } from 'ehr-utils';
import useOttehrUser from '../hooks/useOttehrUser';

type UserType = 'Paciente' | 'Parent/Guardian';

interface PatientInfo {
  id?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dateOfBirth?: string;
  newPatient?: boolean;
  chosenName?: string;
  sex?: Patient['gender'];
  weight?: number;
  weightLastUpdated?: string;
  email?: string;
  emailUser?: UserType;
  reasonForVisit?: string[];
  phoneNumber?: string;
  pointOfDiscovery?: boolean;
}

interface CreateAppointmentParams {
  patient?: PatientInfo;
  slot?: string;
  scheduleType?: 'location' | 'provider';
  visitType?: 'prebook' | 'now';
  visitService?: 'in-person' | 'telemedicine';
  locationID?: string;
  providerID?: string;
  groupID?: string;
  unconfirmedDateOfBirth?: string | undefined;
  timezone: string;
  isDemo?: boolean;
  phoneNumber?: string;
}

export const createSampleAppointments = async (
  fhirClient: FhirClient | undefined,
  authToken: string,
  phoneNumber: string,
  user: User | undefined,
): Promise<void> => {
  try {
    if (!fhirClient) {
      throw new Error('FHIR client not initialized');
    }
    const responses: any[] = [];

    const createAppointmentZambdaId = import.meta.env.VITE_APP_CREATE_APPOINTMENT_ZAMBDA_ID;

    const intakeZambdaUrl = import.meta.env.VITE_APP_INTAKE_ZAMBDAS_URL;

    const appointmentTypes = ['telemedicine', 'in-person'] as const;

    for (let i = 0; i < 10; i++) {
      const visitService = appointmentTypes[i % 2];
      const randomPatientInfo = await generateRandomPatientInfo(fhirClient, visitService, user, phoneNumber);
      const inputBody = JSON.stringify(randomPatientInfo);

      const response = await fetch(`${intakeZambdaUrl}/zambda/${createAppointmentZambdaId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: inputBody,
      });
      responses.push(response);
    }

    console.log('Succesfully created appointments', responses);
  } catch (error: any) {
    console.error('Error creating appointments:', error);
  } finally {
    localStorage.removeItem('selectedLocationID');
  }
};

const generateRandomPatientInfo = async (
  fhirClient: FhirClient,
  visitService: 'in-person' | 'telemedicine',
  user: User | undefined,
  phoneNumber?: string,
): Promise<CreateAppointmentParams> => {
  const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Ethan', 'Fatima', 'Gabriel', 'Hannah', 'Ibrahim', 'Jake'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Jones', 'Brown', 'Clark', 'Davis', 'Elliott', 'Foster', 'Garcia'];
  const sexes: PersonSex[] = [PersonSex.Male, PersonSex.Female, PersonSex.Intersex];

  const searchParams: SearchParam[] = [{ name: 'status', value: 'active' }];

  const allOffices: any[] = await fhirClient?.searchResources({
    resourceType: 'Location',
    searchParams: [{ name: '_count', value: '1000' }],
  });

  const activeOffices = allOffices.filter((item) => item.status === 'active');

  const practitionersTemp: Practitioner[] = await fhirClient.searchResources({
    resourceType: 'Practitioner',
    searchParams: [
      { name: '_count', value: '1000' },
      { name: 'active', value: 'true' },
    ],
  });

  const randomFirstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const randomLastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const randomEmail = `${randomFirstName.toLowerCase()}.${randomLastName.toLowerCase()}@example.com`;
  const randomDateOfBirth = DateTime.now()
    .minus({ years: 7 + Math.floor(Math.random() * 16) })
    .toISODate();
  const randomSex = sexes[Math.floor(Math.random() * sexes.length)];
  const randomLocationIndex = Math.floor(Math.random() * activeOffices.length);
  const randomLocationId = activeOffices[randomLocationIndex].id;
  const randomProviderId = practitionersTemp[Math.floor(Math.random() * practitionersTemp.length)].id;

  const selectedInPersonLocationID = localStorage.getItem('selectedLocationID');
  const selectedState = localStorage.getItem('selectedState');

  const availableStates =
    user?.profileResource &&
    allLicensesForPractitioner(user.profileResource).map((item) => {
      return item.state;
    });

  const randomState = availableStates?.[Math.floor(Math.random() * availableStates.length)] || '';

  const locationId = getLocationIdFromState(selectedState || randomState, allOffices);

  const isLocationActive = activeOffices.some((office) => office.id === locationId);

  const telemedLocationId = isLocationActive ? locationId : randomLocationId;

  if (visitService === 'telemedicine') {
    return {
      patient: {
        newPatient: true,
        firstName: randomFirstName,
        lastName: randomLastName,
        dateOfBirth: randomDateOfBirth,
        sex: randomSex,
        email: randomEmail,
        emailUser: 'Patient',
      },
      scheduleType: 'location',
      visitType: 'now',
      visitService: visitService,
      providerID: randomProviderId,
      timezone: 'UTC',
      isDemo: true,
      phoneNumber: phoneNumber,
      locationID: telemedLocationId,
    };
  }

  return {
    patient: {
      newPatient: true,
      firstName: randomFirstName,
      lastName: randomLastName,
      dateOfBirth: randomDateOfBirth,
      sex: randomSex,
      email: randomEmail,
      emailUser: 'Patient',
    },
    // In fututre we might want to generate future date appointments for the patients
    // slot: DateTime.now()
    //   .plus({ days: Math.floor(Math.random() * 30) })
    //   .toISO(),
    scheduleType: 'location',
    visitType: 'now',
    visitService: visitService,
    locationID: selectedInPersonLocationID || randomLocationId,
    timezone: 'UTC',
    isDemo: true,
    phoneNumber: phoneNumber,
  };
};

const getLocationIdFromState = (state: string, allLocations: any[]): string | undefined => {
  const location = allLocations.find((item) => item.address?.state === state);
  return location?.id;
};
