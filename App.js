import React, {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import {Button, SafeAreaView, Text, View} from 'react-native';
import Livemap from '@wemap/react-native-wemap-livemap';
import * as turf from '@turf/turf';

const INITIAL_MAP_CONFIG = {
  emmid: 18283,
  token: 'at57ea248c510508.01219386',
};

const getRandom = sources => {
  return sources[Math.floor(Math.random() * sources.length)];
};

const pinpointReducer = (state, action) => {
  let previousRessource;
  let newRessource;
  switch (action.type) {
    case 'initPinpoints':
      const lastId = action.value.ressources.length;
      // add initial users on booked ressources
      const users = action.value.ressources
        .filter(r => r.tags.includes('Unavailable'))
        .map((ressource, idx) => {
          const user = getRandom(action.value.usersInitialData);

          // create user as point
          const center = turf.centroid(ressource.geo_entity_shape.geometry);
          return {
            ...user,
            id: lastId + idx,
            longitude: center.geometry.coordinates[0],
            latitude: center.geometry.coordinates[1],
            external_data: {
              ext_id: user.id,
              location: ressource.external_data.ext_id,
              type: 'user',
            },
            // round icon
            type: 1,
          };
        });
      return {
        ...state,
        lastId: lastId + users.length,
        pinpoints: [
          // add external_data status
          ...action.value.ressources.map(p => {
            return {
              ...p,
              external_data: {
                ...p.external_data,
                status: p.tags.includes('Available')
                  ? 'Available'
                  : 'Unavailable',
              },
              geo_entity_shape: turf.simplify(p.geo_entity_shape, {
                tolerance: 0.0000001,
                highQuality: false,
              }),
            };
          }),
          ...users,
        ],
        usersInitialData: action.value.usersInitialData,
      };
    case 'bookRessource':
      previousRessource = state.pinpoints.find(
        r => r.external_data.ext_id === action.value.ressourceId,
      );
      newRessource = {
        ...previousRessource,
        id: state.lastId + 1,
        tags: [
          ...previousRessource.tags.filter(
            t => !['Available', 'Unavailable'].includes(t),
          ),
          'Unavailable',
        ],
        external_data: {
          ...previousRessource.external_data,
          status: 'Unavailable',
        },
        geo_entity_shape: {
          ...previousRessource.geo_entity_shape,
          properties: {
            ...previousRessource.geo_entity_shape.properties,
            fill: '#DE4065',
            stroke: '#DE335B',
          },
        },
      };
      const center = turf.centroid(newRessource.geo_entity_shape.geometry);
      const userPoint = {
        ...action.value.user,
        id: state.lastId + 2,
        longitude: center.geometry.coordinates[0],
        latitude: center.geometry.coordinates[1],
        external_data: {
          ext_id: action.value.user.id,
          location: action.value.ressourceId,
          type: 'user',
        },
        // round icon
        type: 1,
      };

      return {
        ...state,
        lastId: userPoint.id,
        pinpoints: [
          ...state.pinpoints.filter(
            r => r.external_data.ext_id !== newRessource.external_data.ext_id,
          ),
          newRessource,
          userPoint,
        ],
      };

    case 'unbookRessource':
      previousRessource = state.pinpoints.find(
        r => r.external_data.ext_id === action.value.ressourceId,
      );
      newRessource = {
        ...previousRessource,
        id: state.lastId + 1,
        tags: [
          ...previousRessource.tags.filter(
            t => !['Available', 'Unavailable'].includes(t),
          ),
          'Available',
        ],
        external_data: {
          ...previousRessource.external_data,
          status: 'Available',
        },
        geo_entity_shape: {
          ...previousRessource.geo_entity_shape,
          properties: {
            ...previousRessource.geo_entity_shape.properties,
            fill: '#BEE9D7',
            stroke: '#249566',
          },
        },
      };

      return {
        ...state,
        lastId: newRessource.id,
        pinpoints: [
          ...state.pinpoints.filter(
            r =>
              // remove previous geo_entity
              r.external_data.ext_id !== newRessource.external_data.ext_id &&
              // remove previous user
              (typeof r.external_data.location === 'undefined' ||
                r.external_data.location !== action.value.ressourceId),
          ),
          newRessource,
        ],
      };

    default:
      throw new Error();
  }
};

export default () => {
  const livemap = useRef();

  const [pinpointOpened, setPinpointOpen] = useState(null);
  const [pinpointsStore, dispatch] = useReducer(pinpointReducer, {
    lastId: 0,
    pinpoints: [],
    usersInitialData: [],
  });

  const bookRessource = useCallback((ressourceId, user) => {
    dispatch({
      type: 'bookRessource',
      value: {
        ressourceId,
        user,
      },
    });
    livemap.current.closePinpoint();
  }, []);

  const unBookRessource = useCallback(ressourceId => {
    dispatch({
      type: 'unbookRessource',
      value: {ressourceId},
    });
    livemap.current.closePinpoint();
  }, []);

  useEffect(() => {
    if (livemap.current && pinpointsStore.pinpoints.length > 0) {
      livemap.current.setPinpoints(pinpointsStore.pinpoints);
    }
  }, [livemap, pinpointsStore]);

  const onMapReady = useCallback(async () => {
    // init fake user data
    const usersData = await fetch(
      'https://gist.githubusercontent.com/bertrandmd/27ddd1e30484b40c2c42fb1b7427a8ee/raw/bbc33a306d12fc11854e21f1f0e62f121904ce29/users.json',
    ).then(resp => resp.json());

    // load custom floor data
    const floorData = await fetch(
      'https://gist.githubusercontent.com/bertrandmd/98727c95bc607e77dba4fdef22457d8b/raw/3d8a5e7b013268ef94c53bbc7be38b6cb0684a95/floor.json',
    ).then(resp => resp.json());

    dispatch({
      type: 'initPinpoints',
      value: {
        ressources: floorData,
        usersInitialData: usersData,
      },
    });
  }, []);

  return (
    <SafeAreaView style={{flex: 1}}>
      <Livemap
        ref={livemap}
        mapConfig={INITIAL_MAP_CONFIG}
        onMapReady={onMapReady}
        onPinpointOpen={pp => {
          // dont handle "users-pinpoints" click
          if (pp.external_data.type !== 'user') {
            setPinpointOpen(pp);
          } else {
            // force close pinpoint
            livemap.current.closePinpoint();
          }
        }}
        onPinpointClose={() => setPinpointOpen(null)}
        onUserLogin={() => console.log('user login')}
        onUserLogout={() => console.log('user logout')}
        onEventOpen={({id}) => console.log(`event open: ${id}`)}
        onEventClose={() => console.log('event close')}
        onGuidingStarted={() => console.log('guiding started')}
        onGuidingStopped={() => console.log('guiding stopped')}
      />
      <View
        style={{
          backgroundColor: 'grey',
          flex: 0.5,
          justifyContent: 'space-evenly',
          alignItems: 'center',
        }}>
        {pinpointOpened && (
          <>
            <Text
              style={{
                fontSize: 20,
                fontWeight: 'bold',
              }}>
              {pinpointOpened.name}
            </Text>
            <Button
              onPress={() => {
                if (pinpointOpened.external_data.status === 'Available') {
                  bookRessource(
                    pinpointOpened.external_data.ext_id,
                    getRandom(pinpointsStore.usersInitialData),
                  );
                } else {
                  unBookRessource(pinpointOpened.external_data.ext_id);
                }
              }}
              title={
                pinpointOpened.external_data.status === 'Available'
                  ? 'Réserver'
                  : 'Annuler réservation'
              }
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
};
