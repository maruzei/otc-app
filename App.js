import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, SafeAreaView, Alert, ScrollView, TouchableOpacity, Button, TextInput, KeyboardAvoidingView, Platform, Dimensions, Image } from 'react-native';
import { GestureDetector, Gesture, Directions } from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';

const STORAGE_KEY = '@golf_score_card';

// サウンドファイルのパス (仮)
const CLICK_SOUND = require('./assets/click.mp3');
const CONFIRM_SOUND = require('./assets/confirm.mp3');

export default function App() {
  const [hole, setHole] = useState(1);
  const [stroke, setStroke] = useState(0);
  const [scores, setScores] = useState(Array(18).fill(null));
  const [highestReachedHole, setHighestReachedHole] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // View management state
  const [currentView, setCurrentView] = useState('scoring'); // 'scoring', 'results', 'details', 'preview'

  // Details screen state
  const [memo, setMemo] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [imageUri, setImageUri] = useState(null);

  const scrollViewRef = useRef(null);
  const imageRef = useRef();

  // サウンドオブジェクトのref
  const clickSoundRef = useRef(null);
  const confirmSoundRef = useRef(null);

  // --- Image Picker Logic ---
  const selectImageHandler = () => {
    Alert.alert(
      "写真の追加",
      "写真の追加方法を選択してください",
      [
        {
          text: "ライブラリから選択",
          onPress: selectImageFromLibraryAsync,
        },
        {
          text: "カメラで撮影",
          onPress: takePhotoAsync,
        },
        {
          text: "キャンセル",
          style: "cancel",
        },
      ]
    );
  };

  const selectImageFromLibraryAsync = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    } 
  };

  const takePhotoAsync = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("権限エラー", "カメラへのアクセスが許可されていません。");
      return;
    }

    let result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  // --- Screenshot Logic ---
  const onSaveImageAsync = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          "権限が必要です",
          "スクリーンショットを保存するには、写真フォルダへのアクセス許可が必要です。設定画面から許可してください。"
        );
        return;
      }

      const localUri = await captureRef(imageRef, {
        quality: 1,
        format: 'png',
      });

      await MediaLibrary.saveToLibraryAsync(localUri);
      if (localUri) {
        Alert.alert("保存完了", "スクリーンショットを写真フォルダに保存しました。");
      }
    } catch (e) {
      console.log(e);
      Alert.alert("エラー", "スクリーンショットの保存に失敗しました。");
    }
  };

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

  // --- Scroll to current hole ---
  useEffect(() => {
    if (scrollViewRef.current && isLoaded && currentView === 'scoring') {
      const cardWidth = 60 + (5 * 2);
      const currentIndex = hole - 1;
      const offset = (currentIndex * cardWidth) - (Dimensions.get('window').width / 2) + (cardWidth / 2);
      scrollViewRef.current.scrollTo({ x: offset, animated: true });
    }
  }, [hole, isLoaded, currentView]);

  // --- Core Functions ---
  const handleSelectHole = (selectedHole) => {
    if (currentView === 'results' || currentView === 'preview') { // Allow going back to scoring from results/preview
      setCurrentView('scoring');
      setHole(selectedHole);
      setStroke(scores[selectedHole - 1] || 0);
      return;
    }
    if (selectedHole === hole) return;
    if (selectedHole > 18) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (clickSoundRef.current) clickSoundRef.current.replayAsync();

    Alert.alert(
      "スコア修正",
      `ホール${selectedHole}のスコアを修正しますか？`,
      [
        { text: "キャンセル", style: "cancel" },
        { text: "OK", onPress: () => { setHole(selectedHole); setStroke(scores[selectedHole - 1] || 0); } },
      ]
    );
  };

  const goToNextHole = () => {
    const newScores = [...scores];
    newScores[hole - 1] = stroke;
    setScores(newScores);

    if (hole >= highestReachedHole) {
        setHighestReachedHole(hole + 1);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (confirmSoundRef.current) confirmSoundRef.current.replayAsync();

    if (hole < 18) {
      const nextHole = hole + 1;
      setHole(nextHole);
      setStroke(scores[hole] || 0);
    } else {
      Alert.alert("ラウンド終了", "18ホールお疲れ様でした！");
      setCurrentView('results');
    }
  };

  const handleReset = () => {
    Alert.alert(
      "スコアをリセット",
      "本当にすべてのスコアをリセットしますか？この操作は元に戻せません。",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "リセット",
          onPress: () => {
            Alert.alert(
              "最終確認",
              "最終確認: 本当にリセットしますか？",
              [
                { text: "キャンセル", style: "cancel" },
                {
                  text: "すべてリセット",
                  onPress: async () => {
                    setHole(1);
                    setStroke(0);
                    setScores(Array(18).fill(null));
                    setHighestReachedHole(1);
                    setCurrentView('scoring');
                    setImageUri(null);
                    setMemo('');
                    try {
                      await AsyncStorage.removeItem(STORAGE_KEY);
                      Alert.alert("リセット完了", "すべてのスコアがリセットされました。");
                    } catch (e) {
                      Alert.alert("エラー", "リセットに失敗しました。");
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleProceedToDetails = () => {
    const today = new Date();
    const formattedDate = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    setCurrentDate(formattedDate);
    setCurrentView('details');
  };
  
  // --- Gestures ---
  const flingRight = Gesture.Fling().direction(Directions.RIGHT).onEnd(() => {
    if (currentView !== 'scoring') return;
    if (hole <= 18) { setStroke(s => s + 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if (clickSoundRef.current) clickSoundRef.current.replayAsync(); }
  });

  const flingLeft = Gesture.Fling().direction(Directions.LEFT).onEnd(() => {
    if (currentView !== 'scoring') return;
    if (hole <= 18) {
      if (stroke > 0) { setStroke(s => s - 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if (clickSoundRef.current) clickSoundRef.current.replayAsync(); }
      else { Alert.alert("打数エラー", "打数は0未満にできません。"); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
    }
  });

  const flingUp = Gesture.Fling().direction(Directions.UP).onEnd(() => {
    if (currentView !== 'scoring') return;
    if (hole > 18) return;

    const saveCurrentScore = () => { const newScores = [...scores]; newScores[hole - 1] = stroke; setScores(newScores); };

    if (hole >= highestReachedHole) {
      Alert.alert("ホール確定", `ホール${hole}のスコアは ${stroke} です。確定して次のホールへ進みますか？`, [{ text: "キャンセル", style: "cancel" }, { text: "OK", onPress: () => goToNextHole() }]);
    } else {
      Alert.alert("修正完了", `ホール${hole}のスコアを ${stroke} に修正します。よろしいですか？`, [{ text: "キャンセル", style: "cancel" }, { text: "OK", onPress: () => { saveCurrentScore(); if (hole >= highestReachedHole) { setHighestReachedHole(hole + 1); } Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); if (confirmSoundRef.current) confirmSoundRef.current.replayAsync(); } }]);
    }
  });
    
  const composedGesture = Gesture.Race(flingRight, flingLeft, flingUp);

  if (!isLoaded) { return null; }

  // --- Render Logic ---
  const renderScoringView = () => (
    <>
      <View style={styles.mainContent}>
        <Text style={styles.strokeCount}>{stroke}</Text>
      </View>
      <View style={styles.footer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scoreCardContainer} ref={scrollViewRef}>
          {scores.map((score, index) => {
            const holeNumber = index + 1;
            const isCurrentActiveHole = hole === holeNumber;
            const isHolePlayed = score !== null;
            return (
              <TouchableOpacity key={index} onPress={() => handleSelectHole(holeNumber)}>
                <View style={[styles.scoreCard, isCurrentActiveHole && styles.currentHoleCard, isHolePlayed && styles.finalizedCard]}>
                  <Text style={[styles.holeText, isHolePlayed && styles.finalizedText]}>H{holeNumber}</Text>
                  <Text style={[styles.scoreText, isHolePlayed && styles.finalizedText]}>{isCurrentActiveHole ? stroke : (score === null ? '-' : score)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </>
  );

  const renderResultsView = () => {
    const total18HoleScore = scores.reduce((sum, s) => sum + (s || 0), 0);
    const totalH1_H9 = scores.slice(0, 9).reduce((sum, s) => sum + (s || 0), 0);
    const totalH10_H18 = scores.slice(9, 18).reduce((sum, s) => sum + (s || 0), 0);

    const renderCell = (holeNumber, score, isTotal = false) => (
      <TouchableOpacity key={isTotal ? holeNumber : `H${holeNumber}`} style={isTotal ? [styles.gridCell, styles.finalizedCard] : styles.gridCell} onPress={() => { if (!isTotal) { handleSelectHole(holeNumber); } }}>
        {!isTotal && <Text style={styles.gridHoleText}>H{holeNumber}</Text>}
        <Text style={[styles.gridScoreText, isTotal && styles.finalizedText]}>{score === null ? '-' : score}</Text>
      </TouchableOpacity>
    );

    return (
      <ScrollView contentContainerStyle={styles.summaryContainer}>
        <View>
            <Text style={styles.totalScoreBaseText}>
              <Text style={styles.totalScoreZ}>{total18HoleScore}</Text>
              {` = ${totalH1_H9} + ${totalH10_H18}`}
            </Text>
            <View style={styles.scoreTable}>
              <View style={styles.scoreTableGroup}>
                <View style={styles.scoreRow}>{renderCell(1, scores[0])}{renderCell(2, scores[1])}{renderCell(3, scores[2])}{renderCell(4, scores[3])}{renderCell(5, scores[4])}</View>
                <View style={styles.scoreRow}>{renderCell(6, scores[5])}{renderCell(7, scores[6])}{renderCell(8, scores[7])}{renderCell(9, scores[8])}{renderCell('OUT', totalH1_H9, true)}</View>
              </View>
              <View style={styles.scoreTableGroup}>
                <View style={styles.scoreRow}>{renderCell(10, scores[9])}{renderCell(11, scores[10])}{renderCell(12, scores[11])}{renderCell(13, scores[12])}{renderCell(14, scores[13])}</View>
                <View style={styles.scoreRow}>{renderCell(15, scores[14])}{renderCell(16, scores[15])}{renderCell(17, scores[16])}{renderCell(18, scores[17])}{renderCell('IN', totalH10_H18, true)}</View>
              </View>
            </View>
            <Text style={styles.editHintText}>各ホールのスコアをタップして修正できます</Text>
        </View>
        <TouchableOpacity style={[styles.customButton, {marginTop: 20}]} onPress={handleProceedToDetails}>
          <Text style={styles.customButtonText}>スコアを確定して詳細入力へ</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderDetailsView = () => (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.detailsContainer}>
      <ScrollView>
        <Text style={styles.detailsTitle}>ラウンドの詳細</Text>
        <View style={styles.detailsRow}>
          <Text style={styles.detailsLabel}>日付</Text>
          <Text style={styles.detailsValue}>{currentDate}</Text>
        </View>
        <View style={styles.detailsRow}>
          <Text style={styles.detailsLabel}>メモ</Text>
        </View>
        <TextInput
          style={styles.memoInput}
          placeholder="ゴルフ場名、同伴者、感想など（上限140文字）"
          multiline
          maxLength={140}
          onChangeText={setMemo}
          value={memo}
        />
        <View style={styles.detailsRow}>
            <TouchableOpacity style={[styles.customButton, {flex: 1, marginTop: 10}]} onPress={selectImageHandler}>
                <Text style={styles.customButtonText}>写真を追加</Text>
            </TouchableOpacity>
        </View>
        {imageUri && <Image source={{ uri: imageUri }} style={styles.previewImage} />}
        <View style={styles.detailsFooter}>
            <TouchableOpacity style={styles.smallButton} onPress={() => setCurrentView('results')}>
                <Text style={styles.customButtonText}>結果画面へ戻る</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.largeInvertedButton, {paddingVertical: 12}]} onPress={() => setCurrentView('preview')}>
              <Text style={styles.finalizedText}>最終プレビューへ進む</Text>
            </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderPreviewView = () => {
    const total18HoleScore = scores.reduce((sum, s) => sum + (s || 0), 0);

    const renderCell = (holeNumber, score, isTotal = false) => (
        <View style={isTotal ? [styles.gridCell, styles.finalizedCard] : styles.gridCell}>
            {!isTotal && <Text style={styles.gridHoleText}>H{holeNumber}</Text>}
            <Text style={[styles.gridScoreText, isTotal && styles.finalizedText]}>{score === null ? '-' : score}</Text>
        </View>
    );

    return (
        <View style={styles.previewContainer}>
            <ScrollView>
                <View ref={imageRef} collapsable={false} style={{backgroundColor: '#FFFFFF'}}>
                    <View style={styles.previewHeader}>
                        <View style={[styles.finalizedCard, styles.previewTotalScoreBox]}>
                            <Text style={[styles.finalizedText, styles.previewTotalScoreText]}>{total18HoleScore}</Text>
                        </View>
                        <Text style={styles.previewDate}>{currentDate}</Text>
                    </View>

                    <View style={styles.scoreTable}>
                        <View style={styles.scoreTableGroup}>
                            <View style={styles.scoreRow}>{renderCell(1, scores[0])}{renderCell(2, scores[1])}{renderCell(3, scores[2])}{renderCell(4, scores[3])}{renderCell(5, scores[4])}</View>
                            <View style={styles.scoreRow}>{renderCell(6, scores[5])}{renderCell(7, scores[6])}{renderCell(8, scores[7])}{renderCell(9, scores[8])}{renderCell('OUT', scores.slice(0, 9).reduce((s, c) => s + (c || 0), 0), true)}</View>
                        </View>
                        <View style={styles.scoreTableGroup}>
                            <View style={styles.scoreRow}>{renderCell(10, scores[9])}{renderCell(11, scores[10])}{renderCell(12, scores[11])}{renderCell(13, scores[12])}{renderCell(14, scores[13])}</View>
                            <View style={styles.scoreRow}>{renderCell(15, scores[14])}{renderCell(16, scores[15])}{renderCell(17, scores[16])}{renderCell(18, scores[17])}{renderCell('IN', scores.slice(9, 18).reduce((s, c) => s + (c || 0), 0), true)}</View>
                        </View>
                    </View>

                    {memo ? (
                        <View style={styles.previewMemoContainer}>
                            <Text 
                                style={styles.previewMemoText}
                                numberOfLines={6}
                                ellipsizeMode="tail"
                            >
                                {memo}
                            </Text>
                        </View>
                    ) : null}

                    {imageUri && <Image source={{ uri: imageUri }} style={styles.previewImage_final} />}
                </View>
            </ScrollView>
            <View style={styles.previewFooter}>
                <TouchableOpacity style={styles.smallButton} onPress={() => setCurrentView('details')}>
                    <Text style={styles.customButtonText}>詳細入力へ戻る</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.largeInvertedButton} onPress={onSaveImageAsync}>
                    <Text style={styles.finalizedText}>この画像を保存</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
  };

  const renderContent = () => {
    switch (currentView) {
      case 'scoring': return renderScoringView();
      case 'results': return renderResultsView();
      case 'details': return renderDetailsView();
      case 'preview': return renderPreviewView();
      default: return renderScoringView();
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={composedGesture}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            {currentView === 'scoring' && <Text style={styles.headerText}>Hole: {hole}</Text>}
            {currentView === 'scoring' && hole !== highestReachedHole && (
                <TouchableOpacity style={styles.customButton} onPress={() => {
                    if (stroke === (scores[hole - 1] || 0)) { setCurrentView('results'); return; }
                    Alert.alert("修正完了", `ホール${hole}のスコアを ${stroke} に修正します。よろしいですか？`, [
                        { text: "キャンセル", style: "cancel" },
                        {
                            text: "OK",
                            onPress: () => {
                                const newScores = [...scores]; newScores[hole - 1] = stroke; setScores(newScores);
                                if (hole >= highestReachedHole) { setHighestReachedHole(hole + 1); }
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                if (confirmSoundRef.current) confirmSoundRef.current.replayAsync();
                                setCurrentView('results');
                            },
                        },
                    ]);
                }}>
                    <Text style={styles.customButtonText}>結果へ戻る</Text>
                </TouchableOpacity>
            )}
            {currentView !== 'preview' && 
                <TouchableOpacity style={styles.customButton} onPress={handleReset}>
                    <Text style={styles.customButtonText}>Reset</Text>
                </TouchableOpacity>
            }
          </View>
          {renderContent()}
        </SafeAreaView>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  headerText: { color: '#000000', fontSize: 32, fontWeight: 'bold', position: 'absolute', left: 20 },
  mainContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  strokeCount: { color: '#000000', fontSize: 200, fontWeight: 'bold' },
  footer: { paddingVertical: 20, backgroundColor: '#f0f0f0' },
  scoreCardContainer: { paddingHorizontal: 10 },
  scoreCard: { width: 60, height: 80, backgroundColor: '#FFFFFF', borderRadius: 8, marginHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#cccccc' },
  currentHoleCard: { borderColor: '#006600' },
  finalizedCard: { backgroundColor: '#000000' },
  holeText: { color: '#000000', fontSize: 16 },
  scoreText: { color: '#000000', fontSize: 28, fontWeight: 'bold' },
  finalizedText: { color: '#FFFFFF', fontWeight: 'bold' },
  summaryContainer: { flexGrow: 1, justifyContent: 'center', paddingVertical: 20, paddingHorizontal: 10 },
  totalScoreBaseText: { fontSize: 36, fontWeight: 'bold', color: '#000000', marginBottom: 20, textAlign: 'center' },
  totalScoreZ: { fontSize: 54, fontWeight: 'bold' },
  scoreTable: { width: '100%', marginTop: 15 },
  scoreTableGroup: { borderWidth: 2, borderColor: '#000000', marginBottom: 15 },
  scoreRow: { flexDirection: 'row' },
  gridCell: { flex: 1, aspectRatio: 1.2, borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  gridHoleText: { fontSize: 10, color: '#888888', position: 'absolute', top: 2, left: 2 },
  gridScoreText: { fontSize: 36, fontWeight: 'bold', color: '#000000' },
  editHintText: { fontSize: 12, color: '#888888', marginTop: 20, textAlign: 'center' },
  customButton: { borderWidth: 1, borderColor: '#000000', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 5 },
  customButtonText: { color: '#000000', fontWeight: 'bold', fontSize: 16, textAlign: 'center' },
  // Details Screen Styles
  detailsContainer: { flex: 1, padding: 20 },
  detailsTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  detailsRow: { flexDirection: 'row', marginBottom: 15, alignItems: 'center' },
  detailsLabel: { fontSize: 18, fontWeight: 'bold', width: 80 },
  detailsValue: { fontSize: 18 },
  memoInput: { borderWidth: 1, borderColor: '#cccccc', borderRadius: 5, padding: 10, fontSize: 16, minHeight: 100, textAlignVertical: 'top' },
  detailsFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  // Preview Screen Styles
  previewContainer: { flex: 1, padding: 10 },
  previewImage: { width: '100%', height: 150, marginTop: 10, resizeMode: 'contain', borderWidth: 1, borderColor: '#cccccc' },
  previewImage_final: { width: '100%', height: 150, marginTop: 10, resizeMode: 'cover' },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  previewTotalScoreBox: { paddingVertical: 5, paddingHorizontal: 20, borderRadius: 8 },
  previewTotalScoreText: { fontSize: 48, color: '#FFFFFF', fontWeight: 'bold' },
  previewDate: { fontSize: 36, fontWeight: 'bold' },
  previewMemoContainer: { height: 100, padding: 8, borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 5, marginTop: 10 },
  previewMemoText: { fontSize: 16 },
  previewFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  smallButton: { borderWidth: 1, borderColor: '#000000', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 5 },
  largeInvertedButton: { borderWidth: 1, borderColor: '#000000', backgroundColor: '#000000', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 5, flex: 1, marginLeft: 10 },
});
