import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, SafeAreaView, Alert, ScrollView, TouchableOpacity, Button } from 'react-native'; // Buttonを追加
import { GestureDetector, Gesture, Directions } from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

const STORAGE_KEY = '@golf_score_card';

// サウンドファイルのパス (仮)
const CLICK_SOUND = require('./assets/click.mp3');
const CONFIRM_SOUND = require('./assets/confirm.mp3');

export default function App() {
  const [hole, setHole] = useState(1);
  const [stroke, setStroke] = useState(0);
  const [scores, setScores] = useState(Array(18).fill(0));
  const [highestReachedHole, setHighestReachedHole] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const scrollViewRef = useRef(null);

  // サウンドオブジェクトのref
  const clickSoundRef = useRef(null);
  const confirmSoundRef = useRef(null);

  // --- Sound Loading ---
  useEffect(() => {
    const loadSounds = async () => {
      try {
        console.log('Attempting to load click sound...');
        const { sound: clickSoundInstance } = await Audio.Sound.createAsync(CLICK_SOUND);
        clickSoundRef.current = clickSoundInstance;
        console.log('Click sound loaded:', clickSoundInstance);

        console.log('Attempting to load confirm sound...');
        const { sound: confirmSoundInstance } = await Audio.Sound.createAsync(CONFIRM_SOUND);
        confirmSoundRef.current = confirmSoundInstance;
        console.log('Confirm sound loaded:', confirmSoundInstance);

      } catch (error) {
        console.error('Error loading sounds:', error);
      }
    };

    loadSounds();

    // アンマウント時にサウンドをアンロード
    return () => {
      if (clickSoundRef.current) {
        clickSoundRef.current.unloadAsync();
      }
      if (confirmSoundRef.current) {
        confirmSoundRef.current.unloadAsync();
      }
    };
  }, []);

  // --- Data Persistence Hooks ---
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedData = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedData !== null) {
          const { savedHole, savedStroke, savedScores, savedHighestReachedHole } = JSON.parse(savedData);
          setHole(savedHole);
          setStroke(savedStroke);
          setScores(savedScores);
          setHighestReachedHole(savedHighestReachedHole || 1);
        }
      } catch (e) {
        Alert.alert("エラー", "データの読み込みに失敗しました。");
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      const saveData = async () => {
        try {
          const data = {
            savedHole: hole,
            savedStroke: stroke,
            savedScores: scores,
            savedHighestReachedHole: highestReachedHole,
          };
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
          Alert.alert("エラー", "データの保存に失敗しました。");
        }
      };
      saveData();
    }
  }, [hole, stroke, scores, highestReachedHole, isLoaded]);

  // --- Core Functions ---
  const handleSelectHole = (selectedHole) => {
    if (selectedHole === hole) return; // Do nothing if current hole is tapped

    // Feedback for tapping scorecard
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (clickSoundRef.current) clickSoundRef.current.replayAsync();

    Alert.alert(
      "スコア修正",
      `ホール${selectedHole}のスコアを修正しますか？`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "OK",
          onPress: () => {
            setHole(selectedHole);
            setStroke(scores[selectedHole - 1]);
          },
        },
      ]
    );
  };

  const goToNextHole = () => {
    const newScores = [...scores];
    newScores[hole - 1] = stroke;
    setScores(newScores);

    // Feedback for confirming hole
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (confirmSoundRef.current) confirmSoundRef.current.replayAsync();

    if (hole < 18) {
      const nextHole = hole + 1;
      setHole(nextHole);
      setStroke(scores[hole]); // Load next hole's score (0 if unplayed)
      if (nextHole > highestReachedHole) { // 最高到達ホールを更新
        setHighestReachedHole(nextHole);
      }
    } else {
      Alert.alert("ラウンド終了", "18ホールお疲れ様でした！");
    }
  };

  // --- Gestures ---
  const flingRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => {
      setStroke(s => s + 1);
      // Feedback for +1 stroke
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (clickSoundRef.current) clickSoundRef.current.replayAsync();
    });

  const flingLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => {
      if (stroke > 0) {
        setStroke(s => s - 1);
        // Feedback for -1 stroke
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (clickSoundRef.current) clickSoundRef.current.replayAsync();
      } else {
        Alert.alert("打数エラー", "打数は0未満にできません。");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); // Error feedback
      }
    });

  const flingUp = Gesture.Fling()
    .direction(Directions.UP)
    .onEnd(() => {
      const saveCurrentScore = () => {
        const newScores = [...scores];
        newScores[hole - 1] = stroke;
        setScores(newScores);
      };

      if (hole === highestReachedHole) {
        // Normal play: confirm and go to next hole
        Alert.alert(
          "ホール確定",
          `ホール${hole}のスコアは ${stroke} です。確定して次のホールへ進みますか？`,
          [
            { text: "キャンセル", style: "cancel" },
            { text: "OK", onPress: () => goToNextHole() },
          ]
        );
      } else {
        // Editing a past hole: confirm and return to highestReachedHole
        Alert.alert(
          "修正完了",
          `ホール${hole}のスコアを ${stroke} に修正します。よろしいですか？`,
          [
            { text: "キャンセル", style: "cancel" },
            {
              text: "OK",
              onPress: () => {
                saveCurrentScore();
                setHole(highestReachedHole);
                setStroke(scores[highestReachedHole - 1]);
                // Scroll to the highestReachedHole
                if (scrollViewRef.current) {
                  const offset = (highestReachedHole - 1) * (styles.scoreCard.width + styles.scoreCard.marginHorizontal * 2);
                  scrollViewRef.current.scrollTo({ x: offset, animated: true });
                }
                // Feedback for confirming modification
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                if (confirmSoundRef.current) confirmSoundRef.current.replayAsync();
              },
            },
          ]
        );
      }
    });
    
  const composedGesture = Gesture.Race(flingRight, flingLeft, flingUp);

  if (!isLoaded) {
    return null;
  }

  // --- Render --- 
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={composedGesture}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerText}>Hole: {hole}</Text>
          </View>
          <View style={styles.mainContent}>
            <Text style={styles.strokeCount}>{stroke}</Text>
            {/* テスト用ボタン */}
            <Button title="Play Click Sound" onPress={() => {
              if (clickSoundRef.current) {
                console.log('Playing click sound from test button');
                clickSoundRef.current.replayAsync();
              }
            }} />
            <Button title="Play Confirm Sound" onPress={() => {
              if (confirmSoundRef.current) {
                console.log('Playing confirm sound from test button');
                confirmSoundRef.current.replayAsync();
              }
            }} />
          </View>
          <View style={styles.footer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scoreCardContainer}
              ref={scrollViewRef}
            >
              {scores.map((score, index) => {
                const holeNumber = index + 1;
                const isFinalizedByProgress = holeNumber < highestReachedHole;
                const isCurrentHole = hole === holeNumber;

                return (
                  <TouchableOpacity key={index} onPress={() => handleSelectHole(holeNumber)}>
                    <View style={[
                      styles.scoreCard,
                      isCurrentHole && styles.currentHoleCard,
                      isFinalizedByProgress && !isCurrentHole && styles.finalizedCard
                    ]}>
                      <Text style={[
                        styles.holeText,
                        isFinalizedByProgress && !isCurrentHole && styles.finalizedText
                      ]}>H{holeNumber}</Text>
                      <Text style={[
                        styles.scoreText,
                        isFinalizedByProgress && !isCurrentHole && styles.finalizedText
                      ]}>{isCurrentHole ? stroke : score}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </SafeAreaView>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    color: '#000000',
    fontSize: 32,
    fontWeight: 'bold',
  },
  mainContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strokeCount: {
    color: '#000000',
    fontSize: 200,
    fontWeight: 'bold',
  },
  footer: {
    paddingVertical: 20,
    backgroundColor: '#f0f0f0',
  },
  scoreCardContainer: {
    paddingHorizontal: 10,
  },
  scoreCard: {
    width: 60,
    height: 80,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#cccccc',
  },
  currentHoleCard: {
    borderColor: '#006600',
  },
  finalizedCard: {
    backgroundColor: '#000000',
  },
  holeText: {
    color: '#000000',
    fontSize: 16,
  },
  scoreText: {
    color: '#000000',
    fontSize: 28,
    fontWeight: 'bold',
  },
  finalizedText: {
    color: '#FFFFFF',
  },
});